export type HermesRuntimeFailureReason =
  | 'webgl2-unavailable'
  | 'asset-load-failed'
  | 'renderer-init-failed'
  | 'context-lost';

export type HermesRuntimeStatus =
  | { generation: number; lastDrawAt: null; phase: 'starting' }
  | { generation: number; lastDrawAt: number; phase: 'ready' }
  | { generation: number; lastDrawAt: number | null; phase: 'fallback'; reason: HermesRuntimeFailureReason };

export type HermesRuntimeEvent =
  | { at: number; type: 'frame-drawn' }
  | { reason: HermesRuntimeFailureReason; type: 'failed' }
  | { type: 'retry' };

const failureReasons = new Set<HermesRuntimeFailureReason>([
  'webgl2-unavailable',
  'asset-load-failed',
  'renderer-init-failed',
  'context-lost',
]);

export function getHermesRuntimeFailureReason(error: unknown): HermesRuntimeFailureReason {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && failureReasons.has(code as HermesRuntimeFailureReason)) {
      return code as HermesRuntimeFailureReason;
    }
  }
  return 'renderer-init-failed';
}

export const createHermesRuntimeStatus = (generation = 0): HermesRuntimeStatus => ({
  generation,
  lastDrawAt: null,
  phase: 'starting',
});

export function reduceHermesRuntimeStatus(
  status: HermesRuntimeStatus,
  event: HermesRuntimeEvent,
): HermesRuntimeStatus {
  if (event.type === 'retry') return createHermesRuntimeStatus(status.generation + 1);
  if (event.type === 'frame-drawn') return {
    generation: status.generation,
    lastDrawAt: event.at,
    phase: 'ready',
  };
  return {
    generation: status.generation,
    lastDrawAt: status.lastDrawAt,
    phase: 'fallback',
    reason: event.reason,
  };
}

export function resolveHermesMotionControl(
  reducedMotion: boolean,
  status: HermesRuntimeStatus,
): { action: 'enable' | 'reduce' | 'retry' | 'none'; label: 'enable' | 'disable' | 'retry' | 'starting' } {
  if (reducedMotion) return { action: 'enable', label: 'enable' };
  if (status.phase === 'fallback') return { action: 'retry', label: 'retry' };
  if (status.phase === 'starting') return { action: 'none', label: 'starting' };
  return { action: 'reduce', label: 'disable' };
}
