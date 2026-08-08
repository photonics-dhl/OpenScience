import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** WCAG AA 对比度门禁：颜色常量从 tokens.css 正则读出（单一事实来源，防两处漂移）。
 *  相对亮度公式为 WCAG 2.x：sRGB 通道 /255，≤0.04045 除 12.92，否则 ((c+0.055)/1.055)^2.4；
 *  L = 0.2126R + 0.7152G + 0.0722B；ratio = (L1+0.05)/(L2+0.05)。 */

const css = readFileSync(path.join(__dirname, '../app/tokens.css'), 'utf8');
const globalsCss = readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');

/** 解析 :root 块中的 --name: value; 变量（仅取 :root，忽略 @theme 的 var() 引用）。 */
function parseRootVars(source: string): Map<string, string> {
  const rootMatch = source.match(/:root\s*\{([\s\S]*?)\}/);
  if (!rootMatch) throw new Error('tokens.css 缺少 :root 块');
  const vars = new Map<string, string>();
  const re = /--([\w-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rootMatch[1])) !== null) {
    vars.set(m[1], m[2].trim());
  }
  return vars;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) throw new Error(`非 #rrggbb 颜色：${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG 2.x 相对亮度。 */
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fgHex: string, bgHex: string): number {
  const l1 = relativeLuminance(fgHex);
  const l2 = relativeLuminance(bgHex);
  const [lighter, darker] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

const tokens = parseRootVars(css);

function parseThemeVars(source: string): Map<string, string> {
  const themeMatch = source.match(/@theme\s*\{([\s\S]*?)\}/);
  if (!themeMatch) throw new Error('tokens.css 缺少 @theme 块');
  const vars = new Map<string, string>();
  const re = /--([\w-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(themeMatch[1])) !== null) {
    vars.set(m[1], m[2].trim());
  }
  return vars;
}

const themeTokens = parseThemeVars(css);

function token(name: string): string {
  const value = tokens.get(name);
  if (!value) throw new Error(`tokens.css :root 缺少 --${name}`);
  return value;
}

/** 断言配对（前景 token / 背景 token）≥ 4.5（大文本可 ≥3，此处按 4.5 从严）。
 *  --border-subtle 为 rgba 边框色，不参与对比度断言。 */
const pairs: Array<[string, string]> = [
  ['hero-text', 'hero-bg'],
  ['hero-muted', 'hero-bg'],
  ['hero-text', 'hero-surface'],
  ['ink', 'canvas-bg'],
  ['ink', 'paper-bg'],
  ['accent-primary-strong', 'hero-bg'],
  ['hero-text', 'state-danger'],
];

describe('视觉 token WCAG AA 对比度门禁（spec §3）', () => {
  it('spec §3 全部变量已落到 tokens.css :root', () => {
    for (const name of [
      'hero-bg', 'hero-surface', 'hero-text', 'hero-muted',
      'accent-primary', 'accent-primary-strong', 'accent-diff',
      'canvas-bg', 'paper-bg', 'ink', 'border-subtle',
    ]) {
      expect(tokens.has(name), `--${name} 缺失`).toBe(true);
    }
  });

  it('@theme 映射覆盖全部颜色变量（--color-* 引用对应 :root 变量）', () => {
    const themeMatch = css.match(/@theme\s*\{([\s\S]*?)\}/);
    expect(themeMatch).not.toBeNull();
    for (const [name, value] of tokens) {
      // 仅颜色变量要求 --color-* 映射；结构 token（motion-*/z-* 等）不进颜色命名空间
      if (!/^(#|rgb)/.test(value)) continue;
      expect(themeMatch![1]).toContain(`--color-${name}: var(--${name})`);
    }
  });

  for (const [fg, bg] of pairs) {
    it(`${fg}/${bg} 对比度 ≥ 4.5`, () => {
      const ratio = contrastRatio(token(fg), token(bg));
      expect(
        ratio,
        `${fg} (${token(fg)}) / ${bg} (${token(bg)}) = ${ratio.toFixed(2)}`,
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('Figma foundations 与网页 token 契约', () => {
  it('提供批准的 2–64px 间距刻度', () => {
    const expected = new Map([
      ['spacing-2', '0.125rem'],
      ['spacing-4', '0.25rem'],
      ['spacing-8', '0.5rem'],
      ['spacing-12', '0.75rem'],
      ['spacing-16', '1rem'],
      ['spacing-24', '1.5rem'],
      ['spacing-32', '2rem'],
      ['spacing-48', '3rem'],
      ['spacing-64', '4rem'],
    ]);

    for (const [name, value] of expected) {
      expect(themeTokens.get(name), `--${name} 应为 ${value}`).toBe(value);
    }
  });

  it('提供 compact/control/card/pill 四级圆角', () => {
    const expected = new Map([
      ['radius-compact', '0.25rem'],
      ['radius-control', '0.375rem'],
      ['radius-card', '0.75rem'],
      ['radius-pill', '9999px'],
    ]);

    for (const [name, value] of expected) {
      expect(themeTokens.get(name), `--${name} 应为 ${value}`).toBe(value);
    }
  });

  it('提供双字体族与九级中英文学术排版刻度', () => {
    expect(tokens.get('font-display')).toBe("'Noto Serif SC', 'Songti SC', serif");
    expect(tokens.get('font-ui')).toBe(
      "'Noto Sans SC', system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    );

    const expected = new Map([
      ['type-display-xl', ['4rem', '4.5rem']],
      ['type-display-lg', ['3rem', '3.5rem']],
      ['type-heading-xl', ['2.25rem', '2.75rem']],
      ['type-heading-lg', ['1.75rem', '2.25rem']],
      ['type-heading-md', ['1.375rem', '1.875rem']],
      ['type-body-lg', ['1.125rem', '1.875rem']],
      ['type-body-md', ['1rem', '1.625rem']],
      ['type-body-sm', ['0.875rem', '1.375rem']],
      ['type-label-sm', ['0.75rem', '1.125rem']],
    ]);

    for (const [name, [size, lineHeight]] of expected) {
      expect(tokens.get(`${name}-size`), `--${name}-size 应为 ${size}`).toBe(size);
      expect(tokens.get(`${name}-line-height`), `--${name}-line-height 应为 ${lineHeight}`).toBe(lineHeight);
    }

    expect(tokens.get('tracking-display')).toBe('-0.02em');
    expect(tokens.get('tracking-heading')).toBe('-0.01em');
    expect(tokens.get('tracking-body')).toBe('0em');
    expect(tokens.get('tracking-label')).toBe('0.04em');
  });

  it('drawer 使用统一 overlay 层级而非局部硬编码', () => {
    const drawerOverlay = globalsCss.match(/\.drawer-overlay\s*\{([\s\S]*?)\}/);
    expect(drawerOverlay, '.drawer-overlay 规则缺失').not.toBeNull();
    expect(drawerOverlay![1]).toMatch(/z-index\s*:\s*var\(--z-overlay\)\s*;/);
  });
});
