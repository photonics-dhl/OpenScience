import type { HermesRuntimeFailureReason } from './hermes-runtime-status';

export class HermesPetRendererError extends Error {
  readonly code: HermesRuntimeFailureReason;

  constructor(code: HermesRuntimeFailureReason) {
    super(code);
    this.name = 'HermesPetRendererError';
    this.code = code;
  }
}
