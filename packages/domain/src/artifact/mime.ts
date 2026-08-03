import type { Readable } from 'node:stream';
import { streamToBuffer } from '@openscience/storage';

/**
 * 检测内容 MIME 类型（基于文件魔数，非扩展名，§17 类型检测）。
 * - file-type@22 是 ESM-only，用 dynamic import 兼容 CJS 构建（P1B-3 开工实测）。
 * - 无法识别 → undefined（调用方按 Design Gate 决策允许上传，mimeType=null + 审计）。
 */
export async function detectMimeType(content: Buffer | Readable): Promise<string | undefined> {
  const buf = Buffer.isBuffer(content) ? content : await streamToBuffer(content);
  const { fileTypeFromBuffer } = await import('file-type');
  const type = await fileTypeFromBuffer(buf);
  return type?.mime;
}
