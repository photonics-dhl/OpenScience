import type { Application as PixiApplication } from 'pixi.js';
import type { Cubism4InternalModel, Live2DModel as Live2DModelType } from 'pixi-live2d-display/cubism4';

import type { HermesPetMeshInput, HermesPetMeshRenderer, HermesPetMeshSnapshot } from './pet-mesh-renderer';
import { HermesPetRendererError } from './hermes-renderer-error';
import { loadLive2DCubismCore } from './live2d-core-loader';
import { createWankoRendererController, type WankoRuntimePort } from './wanko-renderer-controller';
import type { WankoParameterId, WankoPerformance } from './wanko-action-director';
import {
  claimAbortableWankoResource,
  createWankoMotionSwitch,
} from './wanko-runtime-ownership';
import {
  getWankoModelPlacement,
  resolveWankoPresentationVariant,
  setWankoNativePresentation,
} from './wanko-model-presentation';

const MODEL_SOURCE = '/hermes/live2d/wanko/wanko_touch.model3.json';
const abortError = () => new DOMException('Wanko Live2D initialization aborted', 'AbortError');

interface CubismCoreModel {
  getPartCount(): number;
  getPartId(index: number): unknown;
  setParameterValueById(parameterId: string, value: number, weight?: number): void;
  setPartOpacityByIndex(index: number, opacity: number): void;
}

interface CubismModelEvents {
  off(event: 'beforeModelUpdate', listener: () => void): void;
  on(event: 'beforeModelUpdate', listener: () => void): void;
}

interface WankoModel extends Live2DModelType<Cubism4InternalModel> {
  internalModel: Cubism4InternalModel & CubismModelEvents & {
    coreModel: CubismCoreModel;
    motionManager: {
      state: { shouldRequestIdleMotion(): boolean };
      stopAllMotions(): void;
    };
  };
}

interface CubismRendererCompatibility {
  _clippingManager?: {
    _currentFrameNo: number;
    _maskTexture: undefined;
    findDrawClip(): null;
    getClippingContextListForDraw(): never[];
    getClippingContextListForMask(): never[];
    getRenderTextureCount(): number;
    initialize(): void;
    release(): void;
    setGL(): void;
    setupClippingContext(): void;
  };
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function waitForAbort(signal?: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(abortError()), { once: true });
  });
}

export async function createWankoLive2DRenderer(
  canvas: HTMLCanvasElement,
  stage: HTMLElement,
  getInput: () => HermesPetMeshInput,
  onSnapshot: (snapshot: HermesPetMeshSnapshot) => void,
  signal?: AbortSignal,
): Promise<HermesPetMeshRenderer> {
  if (signal?.aborted) throw abortError();
  const contextAttributes: WebGLContextAttributes = {
    alpha: true,
    antialias: true,
    depth: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    stencil: true,
  };
  const ownedContext = canvas.getContext('webgl2', contextAttributes);
  if (!ownedContext) throw new HermesPetRendererError('webgl2-unavailable');
  let app: PixiApplication<HTMLCanvasElement> | null = null;
  let model: WankoModel | null = null;
  let controller: HermesPetMeshRenderer | null = null;
  let disposed = false;
  const disposePartial = () => {
    if (disposed) return;
    disposed = true;
    controller?.dispose();
    controller = null;
    if (model) {
      model.destroy({ baseTexture: true, children: true, texture: true });
      model = null;
    }
    app?.destroy(false, { baseTexture: true, children: false, texture: true });
    app = null;
    canvas.dataset.hermesRuntimeIntentionalContextLoss = 'true';
    ownedContext.getExtension('WEBGL_lose_context')?.loseContext();
  };

  const onAbort = () => disposePartial();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    await loadLive2DCubismCore(signal);
    const pendingModules = Promise.all([
      import('pixi.js'),
      import('pixi-live2d-display/cubism4'),
    ]);
    const [{ Application }, { Live2DModel, MotionPriority }] = signal
      ? await Promise.race([pendingModules, waitForAbort(signal)])
      : await pendingModules;
    if (signal?.aborted) throw abortError();

    app = new Application<HTMLCanvasElement>({
      antialias: true,
      autoDensity: true,
      autoStart: false,
      backgroundAlpha: 0,
      clearBeforeRender: true,
      context: ownedContext,
      hello: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
      resolution: Math.min(window.devicePixelRatio || 1, 1.5),
      sharedTicker: false,
      view: canvas,
    });
    if (app.renderer.type !== 1) throw new HermesPetRendererError('webgl2-unavailable');

    const pendingModel = Live2DModel.from(MODEL_SOURCE, {
      autoFocus: false,
      autoHitTest: false,
      autoUpdate: false,
      ticker: undefined,
    }) as Promise<WankoModel>;
    model = await claimAbortableWankoResource(
      pendingModel,
      signal,
      (lateModel) => lateModel.destroy({ baseTexture: true, children: true, texture: true }),
    );
    if (signal?.aborted) throw abortError();
    // Wanko has no mask drawables. pixi-live2d-display 0.5 assumes Cubism's
    // private clipping manager exists when a Pixi 7 context is first bound,
    // so provide the no-mask implementation the adapter omitted.
    const cubismRenderer = model.internalModel.renderer as unknown as CubismRendererCompatibility;
    cubismRenderer._clippingManager ??= {
      _currentFrameNo: 0,
      _maskTexture: undefined,
      findDrawClip: () => null,
      getClippingContextListForDraw: () => [],
      getClippingContextListForMask: () => [],
      getRenderTextureCount: () => 0,
      initialize: () => {},
      release: () => {},
      setGL: () => {},
      setupClippingContext: () => {},
    };
    app.stage.addChild(model);
    // Hermes already exposes one semantic HTML button around the canvas. Pixi's
    // accessibility plugin otherwise adds a second absolutely-positioned DOM
    // layer when the user presses Tab; because the canvas lives in an anchored
    // companion margin, that duplicate layer is calculated in canvas rather
    // than document coordinates and can widen the whole page.
    app.stage.accessibleChildren = false;
    model.accessible = false;
    model.accessibleChildren = false;

    let presentationActionKey = '';
    let currentParameters: WankoPerformance['parameters'] = {};
    const hiddenNativeParts = setWankoNativePresentation(model.internalModel.coreModel);
    // Cubism omits the hidden background part from the v09 MOC. The pinned
    // runtime must still suppress the legacy bowl/effect and the CORE guide
    // point group that otherwise renders below the genie lamp.
    if (hiddenNativeParts !== 3 && hiddenNativeParts !== 4) {
      throw new HermesPetRendererError('asset-load-failed');
    }
    const applyParameters = () => {
      const core = model?.internalModel.coreModel;
      if (!core) return;
      setWankoNativePresentation(core);
      for (const [parameterId, value] of Object.entries(currentParameters)) {
        core.setParameterValueById(parameterId as WankoParameterId, value, .72);
      }
    };
    model.internalModel.on('beforeModelUpdate', applyParameters);
    const motionState = model.internalModel.motionManager.state;
    const shouldRequestIdleMotion = motionState.shouldRequestIdleMotion.bind(motionState);
    const motionSwitch = createWankoMotionSwitch(
      (group, index, priority) => model?.motion(group, index, priority) ?? Promise.resolve(false),
      () => model?.internalModel.motionManager.stopAllMotions(),
      MotionPriority.FORCE,
      (enabled) => {
        if (model) model.internalModel.motionManager.state.shouldRequestIdleMotion = enabled
          ? shouldRequestIdleMotion
          : () => false;
      },
    );

    const placeModel = (width: number, height: number) => {
      if (!app || !model) return;
      app.renderer.resize(width, height);
      const placement = getWankoModelPlacement(
        width,
        height,
        model.internalModel.originalWidth,
        model.internalModel.originalHeight,
        resolveWankoPresentationVariant(window.innerWidth),
      );
      model.scale.set(placement.scale);
      model.anchor.set(.5, .5);
      model.position.set(placement.positionX, placement.positionY);
    };

    const runtime: WankoRuntimePort = {
      destroy() {
        motionSwitch.dispose();
        model?.internalModel.off('beforeModelUpdate', applyParameters);
        if (model) {
          model.destroy({ baseTexture: true, children: true, texture: true });
          model = null;
        }
        app?.destroy(false, { baseTexture: true, children: false, texture: true });
        app = null;
        canvas.dataset.hermesRuntimeIntentionalContextLoss = 'true';
        ownedContext.getExtension('WEBGL_lose_context')?.loseContext();
      },
      render(input, performance, deltaMs) {
        if (!app || !model) return false;
        const nextActionKey = `${input.action ?? 'blink-single'}:${input.actionStartedAtMs ?? 0}`;
        if (nextActionKey !== presentationActionKey) {
          presentationActionKey = nextActionKey;
          currentParameters = performance.parameters;
          stage.dataset.hermesWankoPresentation = performance.presentation;
        }
        const priority = performance.motion?.priority === 3
            ? MotionPriority.FORCE
            : performance.motion?.priority === 2
              ? MotionPriority.NORMAL
              : performance.motion ? MotionPriority.IDLE : MotionPriority.NONE;
        motionSwitch.request(nextActionKey, performance.motion, priority);
        const restrained = input.action === 'failed-settle';
        model.internalModel.focusController.focus(restrained ? 0 : input.pointer.x, restrained ? 0 : -input.pointer.y, false);
        model.update(deltaMs);
        app.render();
        return true;
      },
      resize: placeModel,
    };

    disposed = false;
    let firstFrame = true;
    controller = createWankoRendererController(runtime, stage, getInput, (snapshot) => {
      const input = getInput();
      onSnapshot({
        drawnAt: snapshot.drawnAt,
        firstFrame,
        gesture: input.action === 'approval-still'
          ? 'still'
          : input.action === 'failed-settle'
            ? 'failed-settle'
            : input.engaged
              ? 'focus'
              : 'observe',
        headAngle: input.action === 'failed-settle' ? 0 : input.pointer.x * 12,
        status: snapshot.status,
        tailAngle: input.action === 'failed-settle' ? 0 : input.pointer.y * 8,
        torsoScale: 1,
      });
      firstFrame = false;
    });

    const ownedController = controller;
    return {
      dispose() {
        if (disposed) return;
        disposed = true;
        signal?.removeEventListener('abort', onAbort);
        ownedController.dispose();
      },
      resize: () => ownedController.resize(),
      setSuspended: (suspended) => ownedController.setSuspended(suspended),
      wake: () => ownedController.wake(),
    };
  } catch (error) {
    disposePartial();
    signal?.removeEventListener('abort', onAbort);
    if (isAbort(error)) throw error;
    if (error instanceof HermesPetRendererError) throw error;
    throw new HermesPetRendererError('asset-load-failed');
  }
}
