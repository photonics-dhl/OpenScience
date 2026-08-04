import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** 合同测试：中英文案键对齐（§2.5 决策 5 中文优先 i18n 架构）。 */
function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null
      ? flattenKeys(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

const zh = JSON.parse(readFileSync(path.join(__dirname, '../messages/zh.json'), 'utf8')) as Record<string, unknown>;
const en = JSON.parse(readFileSync(path.join(__dirname, '../messages/en.json'), 'utf8')) as Record<string, unknown>;

describe('i18n 键对齐（zh/en，§2.5 决策 5）', () => {
  it('zh 与 en 键集合一致', () => {
    const zhKeys = new Set(flattenKeys(zh));
    const enKeys = new Set(flattenKeys(en));
    const missingInEn = [...zhKeys].filter((k) => !enKeys.has(k));
    const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k));
    expect(missingInEn).toEqual([]);
    expect(missingInZh).toEqual([]);
  });

  it('collab 命名空间含核心键（§18.2 协作区域）', () => {
    const zhCollab = zh.collab as Record<string, unknown>;
    expect(zhCollab.tab).toBeDefined();
    expect(zhCollab.highRisk.confirm).toBeDefined();
    expect(zhCollab.credit.software).toBeDefined();
  });
});
