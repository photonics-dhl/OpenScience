import { StorageDriverNotImplementedError } from './errors';
import { MinioStorageAdapter } from './minio-adapter';
import type { StorageAdapter } from './types';

export type StorageDriver = 'minio' | 'oss';

export interface StorageConfig {
  driver: StorageDriver;
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
}

export function createStorageAdapter(config: StorageConfig): StorageAdapter {
  switch (config.driver) {
    case 'minio':
      return new MinioStorageAdapter(config);
    case 'oss':
      // 迁移期配置位预留（Spec §13.1）；OSS 客户端按 YAGNI 不在 P1A-2 实现。
      throw new StorageDriverNotImplementedError('OSS driver is reserved but not implemented yet');
  }
}

export function storageConfigFromEnv(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  return {
    driver: (env.S3_DRIVER as StorageDriver | undefined) ?? 'minio',
    endPoint: env.S3_ENDPOINT ?? '127.0.0.1',
    port: Number(env.S3_PORT ?? '9000'),
    useSSL: env.S3_USE_SSL === 'true',
    accessKey: env.S3_ACCESS_KEY ?? 'minioadmin',
    secretKey: env.S3_SECRET_KEY ?? 'openscience_minio_dev',
    bucket: env.S3_BUCKET ?? 'openscience-dev',
  };
}
