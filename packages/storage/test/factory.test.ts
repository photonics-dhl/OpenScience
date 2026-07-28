import { describe, expect, it } from 'vitest';
import { createStorageAdapter, storageConfigFromEnv } from '../src/factory';
import { StorageDriverNotImplementedError } from '../src/errors';
import { MinioStorageAdapter } from '../src/minio-adapter';

describe('createStorageAdapter', () => {
  it('returns a MinioStorageAdapter for driver=minio', () => {
    const adapter = createStorageAdapter(storageConfigFromEnv({}));
    expect(adapter).toBeInstanceOf(MinioStorageAdapter);
  });

  it('throws for driver=oss (reserved, not implemented)', () => {
    expect(() => createStorageAdapter({ ...storageConfigFromEnv({}), driver: 'oss' })).toThrow(
      StorageDriverNotImplementedError,
    );
  });
});

describe('storageConfigFromEnv', () => {
  it('applies dev defaults when env is empty', () => {
    const config = storageConfigFromEnv({});
    expect(config).toMatchObject({
      driver: 'minio',
      endPoint: '127.0.0.1',
      port: 9000,
      useSSL: false,
      bucket: 'openscience-dev',
    });
  });

  it('reads overrides from env', () => {
    const config = storageConfigFromEnv({ S3_BUCKET: 'other', S3_PORT: '9443', S3_USE_SSL: 'true' });
    expect(config).toMatchObject({ bucket: 'other', port: 9443, useSSL: true });
  });
});
