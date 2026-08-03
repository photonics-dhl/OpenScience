import type { Readable } from 'node:stream';
import { sha256HexBuffer } from './checksum';
import { streamToBuffer } from './streams';
import type { GetObjectResult, HeadObjectResult, StorageAdapter } from './types';

/** Blob 内容寻址存储键：`blobs/<sha256[0:2]>/<sha256[2:4]>/<sha256>`（分段避免单目录千万文件，§7.2.1）。 */
export function getBlobStorageKey(sha256: string): string {
  return `blobs/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}`;
}

export interface BlobPutResult {
  sha256: string;
  size: number;
  /** 去重标志：true = 内容已存在，未重新上传到对象存储（§7.1 未改变文件只存一次） */
  alreadyExists: boolean;
}

/**
 * 内容寻址写入：计算 SHA-256 → 检查已存在 → 不存在才 putObject。
 * - 已存在：返回 `alreadyExists: true`，不重复上传（去重）
 * - 不存在：putObject(storageKey, content, { sha256 })（adapter 侧再次校验 sha256）
 *
 * 注：Readable 输入会先转 Buffer（小文件场景，P1B-3 单次上传；P1B-5 大文件分片再处理流）。
 */
export async function putBlob(
  adapter: StorageAdapter,
  content: Buffer | Readable,
): Promise<BlobPutResult> {
  const buf = Buffer.isBuffer(content) ? content : await streamToBuffer(content);
  const sha256 = sha256HexBuffer(buf);
  const storageKey = getBlobStorageKey(sha256);
  const existing = await adapter.headObject(storageKey);
  if (existing) {
    return { sha256, size: existing.size, alreadyExists: true };
  }
  const result = await adapter.putObject(storageKey, buf, { sha256 });
  return { sha256, size: result.size, alreadyExists: false };
}

export async function getBlob(adapter: StorageAdapter, sha256: string): Promise<GetObjectResult> {
  return adapter.getObject(getBlobStorageKey(sha256));
}

export async function headBlob(adapter: StorageAdapter, sha256: string): Promise<HeadObjectResult | null> {
  return adapter.headObject(getBlobStorageKey(sha256));
}

export async function deleteBlob(adapter: StorageAdapter, sha256: string): Promise<void> {
  await adapter.deleteObject(getBlobStorageKey(sha256));
}
