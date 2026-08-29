const CORE_SOURCE = '/hermes/live2d/live2dcubismcore.min.js';

let coreTask: Promise<void> | null = null;

const hasCore = () => Boolean((window as unknown as { Live2DCubismCore?: unknown }).Live2DCubismCore);

export function loadLive2DCubismCore(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException('Live2D Core load aborted', 'AbortError'));
  if (hasCore()) return Promise.resolve();

  coreTask ??= new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CORE_SOURCE}"]`);
    const script = existing ?? document.createElement('script');
    const finish = () => {
      if (hasCore()) resolve();
      else reject(new Error('Live2D Cubism Core loaded without exposing its runtime'));
    };
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', () => reject(new Error('Unable to load Live2D Cubism Core')), { once: true });
    if (!existing) {
      script.async = true;
      script.src = CORE_SOURCE;
      script.dataset.hermesLive2dCore = 'true';
      document.head.append(script);
    }
  }).catch((error) => {
    coreTask = null;
    if (!hasCore()) {
      document.querySelector<HTMLScriptElement>(`script[src="${CORE_SOURCE}"]`)?.remove();
    }
    throw error;
  });

  if (!signal) return coreTask;
  return Promise.race([
    coreTask,
    new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Live2D Core load aborted', 'AbortError')), { once: true });
    }),
  ]);
}
