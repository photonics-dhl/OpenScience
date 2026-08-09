import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const tokensCss = readFileSync(path.join(__dirname, '../app/tokens.css'), 'utf8');
const globalsCss = readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
const layout = readFileSync(path.join(__dirname, '../app/layout.tsx'), 'utf8');
const button = readFileSync(path.join(__dirname, '../components/ui/button.tsx'), 'utf8');
const badge = readFileSync(path.join(__dirname, '../components/ui/badge.tsx'), 'utf8');
const input = readFileSync(path.join(__dirname, '../components/ui/input.tsx'), 'utf8');
const dropzone = readFileSync(path.join(__dirname, '../components/ui/dropzone.tsx'), 'utf8');

describe('Optical Editorial v3 foundations', () => {
  it('removes the decorative blue and violet palette from canonical tokens', () => {
    for (const retiredColor of ['#4c8dff', '#2a6dff', '#2563eb', '#07111f', '#0d1b2d', '#13243a']) {
      expect(tokensCss.toLowerCase()).not.toContain(retiredColor);
    }
  });

  it('defines the restrained 0/4/8px radius scale', () => {
    expect(tokensCss).toContain('--radius-flat: 0px');
    expect(tokensCss).toContain('--radius-control: 4px');
    expect(tokensCss).toContain('--radius-panel: 8px');
    expect(tokensCss).not.toContain('--radius-card: 0.75rem');
  });

  it('defines semantic font and motion roles', () => {
    for (const name of [
      '--font-display-grotesk', '--font-editorial-serif', '--font-cjk-serif',
      '--font-ui', '--font-data', '--motion-focus', '--motion-reveal',
      '--motion-scan', '--ease-optical',
    ]) {
      expect(tokensCss).toContain(name);
    }
  });

  it('loads the approved self-hosted-at-build font roles through next/font', () => {
    for (const font of ['Bricolage_Grotesque', 'Bodoni_Moda', 'IBM_Plex_Mono', 'Noto_Serif_SC']) {
      expect(layout).toContain(font);
    }
    for (const variable of ['--font-bricolage', '--font-bodoni', '--font-ibm-plex-mono', '--font-noto-serif-sc']) {
      expect(layout).toContain(variable);
    }
  });

  it('keeps consumed primary controls and paper focus states accessible', () => {
    expect(button).toContain('bg-accent-primary-strong text-os-black-0');
    expect(button).toContain('focus-visible:ring-focus-ring');
    expect(badge).toContain('bg-accent-primary-strong text-os-black-0');
    expect(badge).toContain('focus:ring-focus-ring');
    expect(input).toContain('focus-visible:ring-focus-ring');
    expect(dropzone).toContain('bg-accent-primary-strong px-4 py-2 text-sm font-semibold text-os-black-0');
  });

  it('has a global reduced-motion safety net and never transitions all properties', () => {
    expect(globalsCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(globalsCss).not.toMatch(/transition\s*:\s*all\b/i);
  });
});
