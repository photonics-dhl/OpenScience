import { describe, expect, it } from 'vitest';
import { sha256HexBuffer } from '../src/checksum';
import { createStorageAdapter, storageConfigFromEnv } from '../src/factory';

// P1A-2 云上验收（task-master 2.2）：真实 MinIO 全链路。
// 前置：dev 栈已起（stack:up，minio-init 已建 bucket openscience-dev）。
const adapter = createStorageAdapter(storageConfigFromEnv());

async function drain(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

describe('P1A-2 MinIO storage roundtrip (cloud, real MinIO)', () => {
  it('put → head → get（sha256 校验）→ delete', async () => {
    const key = `integration/p1a2-${Date.now()}.bin`;
    const payload = Buffer.from(`openscience-integration-${Math.random()}`);
    const sha256 = sha256HexBuffer(payload);

    const put = await adapter.putObject(key, payload, { contentType: 'application/octet-stream', sha256 });
    expect(put.size).toBe(payload.length);

    const head = await adapter.headObject(key);
    expect(head?.size).toBe(payload.length);

    const got = await adapter.getObject(key);
    expect(sha256HexBuffer(await drain(got.body))).toBe(sha256);

    await adapter.deleteObject(key);
    expect(await adapter.headObject(key)).toBeNull();
  });
});
