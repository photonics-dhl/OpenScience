import type { Readable } from 'node:stream';

export interface ScanResult {
  safe: boolean;
  threat?: string;
}

/**
 * 恶意内容扫描（§17 MUST）。
 * P1B-3 占位：返回 `{ safe: true }`。P1B-8 实装接入 ClamAV / VirusTotal API。
 */
export async function scanFile(content: Buffer | Readable): Promise<ScanResult> {
  void content; // P1B-3 占位不消费内容；P1B-8 实装扫描
  return { safe: true };
}
