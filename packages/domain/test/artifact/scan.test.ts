import { describe, expect, it } from 'vitest';
import { scanFile } from '../../src/artifact/scan';

describe('artifact fast malware scan', () => {
  it('does not classify a legitimate PDF object reference as ZIP path traversal', async () => {
    const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<</URI(../supplement/data.csv)>>\nendobj\n%%EOF');
    await expect(scanFile(pdf)).resolves.toEqual({ safe: true });
  });

  it('continues to reject path traversal inside a ZIP container', async () => {
    const zip = Buffer.from(
      'UEsDBBQAAAAIAHWgEV0VaixCDwAAAAcAAAAOAAAALi4vb3V0c2lkZS50eHQqSKzMyU9MAQAAAP//AwBQSwECFAAUAAAACAB1oBFdFWosQg8AAAAHAAAADgAAAAAAAAAAAAAAAAAAAAAALi4vb3V0c2lkZS50eHRQSwUGAAAAAAEAAQA8AAAAOwAAAAAA',
      'base64',
    );
    await expect(scanFile(zip)).resolves.toEqual({ safe: false, threat: 'archive-path-traversal' });
  });
});
