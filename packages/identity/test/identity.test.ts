import { describe, expect, it } from 'vitest';
import { uuidv7, isUuidV7, generatePublicId, parsePublicId, versionPublicId, researchUrl, parseVersionId } from '../src';

describe('uuidv7（§6.1 内部主键）', () => {
  it('格式 8-4-4-4-12 + version 位 7 + variant 位', () => {
    const u = uuidv7();
    expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(u[14]).toBe('7'); // version 位
    expect('89ab'.includes(u[19].toLowerCase())).toBe(true); // variant 位
    expect(isUuidV7(u)).toBe(true);
  });

  it('100 个不重复', () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) set.add(uuidv7());
    expect(set.size).toBe(100);
  });

  it('时间戳排序：早时间 < 晚时间', () => {
    const early = uuidv7(1000000);
    const late = uuidv7(2000000);
    expect(early < late).toBe(true);
  });

  it('isUuidV7 拒绝非 v7', () => {
    expect(isUuidV7('00000000-0000-4000-8000-000000000000')).toBe(false);
  });
});

describe('公开 ID（§6.1 OSR-YYYY-NNNNNN）', () => {
  it('生成 + 解析往返', () => {
    const id = generatePublicId('OSR', 2026, 1);
    expect(id).toBe('OSR-2026-000001');
    expect(parsePublicId(id)).toEqual({ prefix: 'OSR', year: 2026, seq: 1 });
  });

  it('seq 6 位补零', () => {
    expect(generatePublicId('OSR', 2026, 42)).toBe('OSR-2026-000042');
    expect(generatePublicId('OSR', 2026, 999999)).toBe('OSR-2026-999999');
  });

  it('非法 ID → null', () => {
    expect(parsePublicId('OSR-2026')).toBeNull();
    expect(parsePublicId('xyz')).toBeNull();
    expect(parsePublicId('OSR-abc-123')).toBeNull();
  });

  it('自定义前缀（§24 配置）', () => {
    expect(generatePublicId('SCIENTIA', 2026, 7)).toBe('SCIENTIA-2026-000007');
    expect(parsePublicId('SCIENTIA-2026-000007')).toMatchObject({ prefix: 'SCIENTIA' });
  });
});

describe('版本 ID / URL（§6.1）', () => {
  it('版本 ID OSR-YYYY-NNNNNN-vN', () => {
    expect(versionPublicId('OSR-2026-000001', 2)).toBe('OSR-2026-000001-v2');
    expect(parseVersionId('OSR-2026-000001-v2')).toEqual({ roPublicId: 'OSR-2026-000001', versionNo: 2 });
  });

  it('稳定 URL /research/<id>/v/<n>', () => {
    expect(researchUrl('OSR-2026-000001', 3)).toBe('/research/OSR-2026-000001/v/3');
  });

  it('非法版本 ID → null', () => {
    expect(parseVersionId('OSR-2026-000001')).toBeNull();
  });
});
