import { describe, expect, it } from 'vitest';
import { mapMinioError } from '../src/minio-adapter';
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
