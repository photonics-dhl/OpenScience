export type ForkErrorCode =
  | 'RESEARCH_OBJECT_NOT_FOUND'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'SOURCE_NOT_PUBLIC' // 仅 public 源可 Fork（§4.2）
  | 'VERSION_NO_MANIFEST' // 源版本无 manifest entries
  | 'INHERITANCE_VIOLATION' // 许可继承校验不通过（§6.3）
  | 'ALREADY_FORKED'; // forkedRoId 唯一（§8.1 一 RO 至多一个来源）

export class ForkError extends Error {
  constructor(
    readonly code: ForkErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
