export interface StoredObjectMetadata {
  readonly key: string;
  readonly size: number;
  readonly httpEtag: string;
}
export interface StoredObjectBody extends StoredObjectMetadata {
  readonly body: ReadableStream<Uint8Array>;
}
export interface ObjectWriteOptions {
  httpMetadata: { contentType: string };
  customMetadata: Record<string, string>;
}
export type ObjectWriteOutcome =
  | { kind: 'confirmed-write' }
  | { kind: 'unconfirmed-write'; cause: unknown };
export type ObjectDeleteOutcome =
  | { kind: 'confirmed-delete' }
  | { kind: 'unconfirmed-delete'; cause: unknown };
export interface FileStorage {
  head(key: string): Promise<StoredObjectMetadata | null>;
  get(key: string): Promise<StoredObjectBody | null>;
  put(
    key: string,
    body: Uint8Array | ReadableStream<Uint8Array>,
    options: ObjectWriteOptions,
  ): Promise<ObjectWriteOutcome>;
  delete(key: string): Promise<ObjectDeleteOutcome>;
}
class R2Storage implements FileStorage {
  readonly #bucket: R2Bucket;
  constructor(bucket: R2Bucket) {
    this.#bucket = bucket;
  }
  async head(key: string): Promise<StoredObjectMetadata | null> {
    const object = await this.#bucket.head(key);
    return object ? { key: object.key, size: object.size, httpEtag: object.httpEtag } : null;
  }
  async get(key: string): Promise<StoredObjectBody | null> {
    const object = await this.#bucket.get(key);
    return object
      ? { key: object.key, size: object.size, httpEtag: object.httpEtag, body: object.body }
      : null;
  }
  async put(
    key: string,
    body: Uint8Array | ReadableStream<Uint8Array>,
    options: ObjectWriteOptions,
  ): Promise<ObjectWriteOutcome> {
    try {
      await this.#bucket.put(key, body, options);
      return { kind: 'confirmed-write' };
    } catch (cause) {
      return { kind: 'unconfirmed-write', cause };
    }
  }
  async delete(key: string): Promise<ObjectDeleteOutcome> {
    try {
      await this.#bucket.delete(key);
      return { kind: 'confirmed-delete' };
    } catch (cause) {
      return { kind: 'unconfirmed-delete', cause };
    }
  }
}
export function createR2Storage(bucket: R2Bucket): FileStorage {
  return new R2Storage(bucket);
}
