import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const tokens = readFileSync(path.join(__dirname, '../app/tokens.css'), 'utf8');
const globals = readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
const browserGate = readFileSync(path.join(__dirname, 'visual/workspace-readability-gate.mjs'), 'utf8');

describe('workspace readability foundation', () => {
  it('defines semantic text roles for controls and sustained reading', () => {
    expect(tokens).toContain('--text-caption: 0.75rem');
    expect(tokens).toContain('--text-control: 0.875rem');
    expect(tokens).toContain('--text-body: 1rem');
    expect(tokens).toContain('--text-reading: 1.0625rem');
    expect(tokens).toContain('--leading-body: 1.6');
    expect(tokens).toContain('--leading-reading: 1.7');
  });

  it('normalizes form typography and button paint without Tailwind preflight', () => {
    expect(globals).toMatch(/button,\s*input,\s*select,\s*textarea\s*\{[\s\S]*?font:\s*inherit/);
    expect(globals).toMatch(/button\s*\{[\s\S]*?background:\s*transparent/);
  });

  it('gives Hermes actions explicit readable control states', () => {
    const actions = globals.match(/\.hermes-companion-actions button,[\s\S]*?\n\}/)?.[0] ?? '';
    expect(actions).toContain('font-size: var(--text-control)');
    expect(actions).toMatch(/background:\s*rgb\(/);
    expect(actions).toContain('cursor: pointer');
    expect(globals).toMatch(/\.hermes-companion-actions button:hover[\s\S]*?background:/);
    expect(globals).toMatch(/\.hermes-companion-actions button:focus-visible[\s\S]*?outline:/);
    expect(globals).toMatch(/\.hermes-companion-actions button:disabled[\s\S]*?cursor:\s*not-allowed/);
  });

  it('measures contrast, vertical clipping, and keyboard focus instead of inferring accessibility', () => {
    expect(browserGate).toContain('contrastRatio');
    expect(browserGate).toContain('contrastFailures');
    expect(browserGate).toContain("tag === 'INPUT' || tag === 'TEXTAREA'");
    expect(browserGate).toContain('verticallyClipped');
    expect(browserGate).toContain('auditKeyboardFocus');
    expect(browserGate).toContain("page.keyboard.press('Tab')");
    expect(browserGate).toContain('firstFocused');
    expect(browserGate).not.toContain('visited.has(key)');
  });
});
