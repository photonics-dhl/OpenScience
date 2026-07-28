import type { Readable } from 'node:stream';

export interface PutObjectOptions {
  contentType?: string;
  /** 提供时在上传前校验内容 SHA-256（hex），不匹配抛 ChecksumMismatchError */
  sha256?: string;
}

export interface PutObjectResult {
  key: string;
  size: number;
  etag: string;
}

export interface GetObjectResult {
  body: Readable;
  size: number;
  contentType?: string;
}

export interface HeadObjectResult {
  size: number;
  etag: string;
  contentType?: string;
  sha256?: string;
}

export interface StorageAdapter {
  putObject(key: string, body: Buffer | Readable, opts?: PutObjectOptions): Promise<PutObjectResult>;
  getObject(key: string): Promise<GetObjectResult>;
  headObject(key: string): Promise<HeadObjectResult | null>;
  deleteObject(key: string): Promise<void>;
}
