import type { Readable } from 'node:stream';
import { streamToBuffer } from '@openscience/storage';

export interface ScanResult {
  safe: boolean;
  threat?: string;
}

/**
 * 恶意内容扫描（§17 MUST）。
 * 当前为进程内快速阻断器：拒绝 EICAR、PE/可执行魔数与明显 ZIP 路径穿越；生产仍需在 quarantine 层接入 ClamAV/同类引擎后才可称为完整病毒扫描。
 */
export async function scanFile(content: Buffer | Readable): Promise<ScanResult> {
  const buf = Buffer.isBuffer(content) ? content : await streamToBuffer(content);
  if (buf.subarray(0, 2).toString('ascii') === 'MZ') return { safe: false, threat: 'pe-executable' };
  if (buf.includes(Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'))) {
    return { safe: false, threat: 'eicar-test-signature' };
  }
  const zipSignature = buf.subarray(0, 4);
  const isZipContainer = zipSignature.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
    || zipSignature.equals(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
    || zipSignature.equals(Buffer.from([0x50, 0x4b, 0x07, 0x08]));
  if (isZipContainer && (buf.includes(Buffer.from('../')) || buf.includes(Buffer.from('..\\')))) {
    return { safe: false, threat: 'archive-path-traversal' };
  }
  return { safe: true };
}
