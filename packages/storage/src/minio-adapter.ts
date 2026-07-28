import * as Minio from 'minio';
import type { Readable } from 'node:stream';
import { sha256HexBuffer } from './checksum';
import { ChecksumMismatchError, ObjectNotFoundError, StorageError, StorageUnavailableError } from './errors';
import { streamToBuffer } from './streams';
import type { HeadObjectResult, PutObjectOptions, PutObjectResult, GetObjectResult, StorageAdapter } from './types';
import type { StorageConfig } from './factory';

const NETWORK_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN']);

/** 把 minio/网络错误映射为 StorageError 子类（可单测的纯函数）。 */
export function mapMinioError(err: unknown): StorageError {
  const e = err as { code?: string; message?: string } | null | undefined;
  const code = e?.code ?? '';
  const message = e?.message ?? String(err);
  if (code === 'NoSuchKey') return new ObjectNotFoundError(`Object not found: ${message}`, err);
  if (NETWORK_CODES.has(code)) return new StorageUnavailableError(`Storage unavailable: ${message}`, err);
  return new StorageError(`Storage error (${code || 'unknown'}): ${message}`, err);
}

export class MinioStorageAdapter implements StorageAdapter {
  private readonly client: Minio.Client;
  private readonly bucket: string;

  constructor(config: StorageConfig) {
    this.bucket = config.bucket;
    this.client = new Minio.Client({
      endPoint: config.endPoint,
      port: config.port,
      useSSL: config.useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });
  }

  async putObject(key: string, body: Buffer | Readable, opts: PutObjectOptions = {}): Promise<PutObjectResult> {
    const buf = Buffer.isBuffer(body) ? body : await streamToBuffer(body);
    if (opts.sha256) {
      const actual = sha256HexBuffer(buf);
      if (actual !== opts.sha256.toLowerCase()) {
        throw new ChecksumMismatchError(
          `sha256 mismatch for "${key}": expected ${opts.sha256}, got ${actual}`,
        );
      }
    }
    const metaData: Record<string, string> = { 'x-amz-meta-sha256': sha256HexBuffer(buf) };
    if (opts.contentType) metaData['Content-Type'] = opts.contentType;
    try {
      const result = await this.client.putObject(this.bucket, key, buf, buf.length, metaData);
      return { key, size: buf.length, etag: result.etag };
    } catch (err) {
      throw mapMinioError(err);
    }
  }

  async getObject(key: string): Promise<GetObjectResult> {
    const head = await this.headObject(key);
    if (!head) throw new ObjectNotFoundError(`Object not found: ${key}`);
    try {
      const body = await this.client.getObject(this.bucket, key);
      return { body, size: head.size, contentType: head.contentType };
    } catch (err) {
      throw mapMinioError(err);
    }
  }

  async headObject(key: string): Promise<HeadObjectResult | null> {
    try {
      const stat = await this.client.statObject(this.bucket, key);
      const meta = (stat.metaData ?? {}) as Record<string, string>;
      return {
        size: stat.size,
        etag: stat.etag,
        contentType: meta['content-type'],
        sha256: meta['x-amz-meta-sha256'],
      };
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'NoSuchKey' || code === 'NotFound') return null;
      throw mapMinioError(err);
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.removeObject(this.bucket, key);
    } catch (err) {
      throw mapMinioError(err);
    }
  }
}
