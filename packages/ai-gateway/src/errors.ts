export type AiGatewayErrorCode =
  | 'ALL_PROVIDERS_FAILED'
  | 'SCHEMA_VALIDATION'
  | 'NO_PROVIDER_CONFIG'
  | 'STREAM_NOT_IMPLEMENTED'; // §9.3 流式独立通道（5.3 实装）

export class AiGatewayError extends Error {
  constructor(
    readonly code: AiGatewayErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
