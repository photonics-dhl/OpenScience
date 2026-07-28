export class StorageError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ObjectNotFoundError extends StorageError {}
export class ChecksumMismatchError extends StorageError {}
export class StorageUnavailableError extends StorageError {}
export class StorageDriverNotImplementedError extends StorageError {}
