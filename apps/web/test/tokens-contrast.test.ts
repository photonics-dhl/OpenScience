import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** WCAG AA 对比度门禁：颜色常量从 tokens.css 正则读出（单一事实来源，防两处漂移）。
 *  相对亮度公式为 WCAG 2.x：sRGB 通道 /255，≤0.04045 除 12.92，否则 ((c+0.055)/1.055)^2.4；
 *  L = 0.2126R + 0.7152G + 0.0722B；ratio = (L1+0.05)/(L2+0.05)。 */

const css = readFileSync(path.join(__dirname, '../app/tokens.css'), 'utf8');

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
