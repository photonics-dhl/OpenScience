import { describe, expect, it } from 'vitest';
import { mapMinioError, readMinioSha256Metadata } from '../src/minio-adapter';
import { ObjectNotFoundError, StorageError, StorageUnavailableError } from '../src/errors';

describe('mapMinioError', () => {
  it('maps NoSuchKey to ObjectNotFoundError', () => {
    expect(mapMinioError({ code: 'NoSuchKey', message: 'missing' })).toBeInstanceOf(ObjectNotFoundError);
  });

  it('maps network codes to StorageUnavailableError', () => {
    expect(mapMinioError({ code: 'ECONNREFUSED', message: 'refused' })).toBeInstanceOf(
      StorageUnavailableError,
    );
  });

  it('maps unknown errors to StorageError', () => {
    const mapped = mapMinioError({ code: 'InternalError', message: 'boom' });
    expect(mapped).toBeInstanceOf(StorageError);
    expect(mapped).not.toBeInstanceOf(StorageUnavailableError);
  });
});

describe('readMinioSha256Metadata', () => {
  const sha256 = 'a'.repeat(64);

  it('accepts the normalized user-metadata key returned by SeaweedFS through minio-js', () => {
    expect(readMinioSha256Metadata({ sha256 })).toBe(sha256);
  });

  it('retains compatibility with an adapter that returns the full S3 metadata header', () => {
    expect(readMinioSha256Metadata({ 'x-amz-meta-sha256': sha256 })).toBe(sha256);
  });

  it('fails closed for malformed checksum metadata', () => {
    expect(readMinioSha256Metadata({ sha256: 'not-a-checksum' })).toBeUndefined();
  });
});
