import { describe, expect, it } from '@jest/globals';
import { Readable } from 'node:stream';
import { collectArtifacts, extractTarEntries, mimeTypeFor } from '../src/artifact-collector';

/** 最小 ustar 头构造（仅供测试：parser 不校验 checksum，但按规范填入）。 */
function tarHeader(name: string, size: number, typeflag: string): Buffer {
  const h = Buffer.alloc(512);
  h.write(name, 0, 'utf8');
  h.write('0000644\0', 100);
  h.write('0001000\0', 108);
  h.write('0001000\0', 116);
  h.write(size.toString(8).padStart(11, '0') + '\0', 124);
  h.write('00000000000\0', 136);
  h.write('        ', 148); // checksum 占位空格
  h.write(typeflag, 156);
  h.write('ustar\0', 257);
  h.write('00', 263);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return h;
}

function buildTar(entries: Array<{ name: string; data?: Buffer; dir?: boolean }>): Buffer {
  const parts: Buffer[] = [];
  for (const e of entries) {
    const data = e.data ?? Buffer.alloc(0);
    parts.push(tarHeader(e.name, data.length, e.dir ? '5' : '0'));
    if (!e.dir) {
      parts.push(data);
      const pad = (512 - (data.length % 512)) % 512;
      if (pad) parts.push(Buffer.alloc(pad));
    }
  }
  parts.push(Buffer.alloc(1024)); // 两个全零块收尾
  return Buffer.concat(parts);
}

describe('extractTarEntries（最小 ustar 解包）', () => {
  it('提取普通文件，跳过目录项', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const tar = buildTar([
      { name: 'output/', dir: true },
      { name: 'output/plot.png', data: png },
    ]);
    const entries = extractTarEntries(tar);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('output/plot.png');
    expect(entries[0].data.equals(png)).toBe(true);
  });

  it('多文件', () => {
    const tar = buildTar([
      { name: 'output/a.txt', data: Buffer.from('hello') },
      { name: 'output/b.csv', data: Buffer.from('x,y\n1,2\n') },
    ]);
    const entries = extractTarEntries(tar);
    expect(entries.map((e) => e.name)).toEqual(['output/a.txt', 'output/b.csv']);
    expect(entries[1].data.toString()).toBe('x,y\n1,2\n');
  });

  it('空归档（仅零块）→ 空数组', () => {
    expect(extractTarEntries(Buffer.alloc(1024))).toEqual([]);
  });

  it('非 512 对齐的脏尾巴不炸', () => {
    const tar = Buffer.concat([buildTar([{ name: 'f.txt', data: Buffer.from('x') }]), Buffer.from('junk')]);
    expect(extractTarEntries(tar)).toHaveLength(1);
  });
});

describe('mimeTypeFor', () => {
  it('常见扩展名映射', () => {
    expect(mimeTypeFor('plot.png')).toBe('image/png');
    expect(mimeTypeFor('fig.SVG')).toBe('image/svg+xml');
    expect(mimeTypeFor('data.csv')).toBe('text/csv');
    expect(mimeTypeFor('archive.bin')).toBe('application/octet-stream');
    expect(mimeTypeFor('noext')).toBe('application/octet-stream');
  });
});

describe('collectArtifacts（fake 容器接缝，无 Docker）', () => {
  it('从 /output tar 流收集产物：basename 文件名 + mime + size + data', async () => {
    const png = Buffer.from([1, 2, 3, 4, 5]);
    const tar = buildTar([
      { name: 'output/', dir: true },
      { name: 'output/plot.png', data: png },
    ]);
    const container = { getArchive: async () => Readable.from(tar) };
    const artifacts = await collectArtifacts(container);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].filename).toBe('plot.png');
    expect(artifacts[0].mimeType).toBe('image/png');
    expect(artifacts[0].size).toBe(5);
    expect(artifacts[0].data.equals(png)).toBe(true);
  });

  it('/output 不存在或读取失败 → 空数组（不炸作业）', async () => {
    const container = {
      getArchive: async () => {
        throw new Error('no such file or directory');
      },
    };
    expect(await collectArtifacts(container)).toEqual([]);
  });
});
