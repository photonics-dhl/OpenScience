import { randomBytes } from 'node:crypto';

/**
 * UUID v7（RFC 9562）：48bit unix 毫秒时间戳 + version(0111) + 随机 + variant(10xx)。
 * Node 20 无内置 v7，手写（P1B-6 决策）。时间戳可排序（§6.1 内部主键）。
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = randomBytes(16);
  // 前 6 字节 = 48bit 时间戳（大端）
  const ts = BigInt(Math.floor(now));
  bytes[0] = Number((ts >> 40n) & 0xffn);
  bytes[1] = Number((ts >> 32n) & 0xffn);
  bytes[2] = Number((ts >> 24n) & 0xffn);
  bytes[3] = Number((ts >> 16n) & 0xffn);
  bytes[4] = Number((ts >> 8n) & 0xffn);
  bytes[5] = Number(ts & 0xffn);
  // version = 7（第 7 字节高 4 位）
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  // variant = 10xx（第 9 字节高 2 位）
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytesToHex(bytes);
}

/** bytes → 8-4-4-4-12 UUID hex 格式。 */
function bytesToHex(b: Buffer): string {
  const hex = b.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** 校验字符串是合法 UUID v7（version 位 = 7）。 */
export function isUuidV7(uuid: string): boolean {
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return re.test(uuid);
}
