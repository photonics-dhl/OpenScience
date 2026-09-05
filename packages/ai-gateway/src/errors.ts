export type AiGatewayErrorCode =
  | 'IMAGE_PROVIDER_FAILED'
  | 'IMAGE_REQUEST_INVALID'
  | 'ALL_PROVIDERS_FAILED'
  | 'SCHEMA_VALIDATION'
  | 'NO_PROVIDER_CONFIG'
  | 'OCR_REQUEST_INVALID'
  | 'OCR_EXTERNAL_PROCESSING_DENIED'
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
