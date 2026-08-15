import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const labels: Record<string, string> = {
  'status.queued': 'Queued',
  'status.parsing': 'Parsing evidence',
  'status.needs_review': 'Needs review',
  'status.confirmed': 'Confirmed',
  'status.failed_retryable': 'Retry available',
  'status.missing': 'Missing',
  'status.inferred': 'Inferred',
  'confidence.high': 'High confidence',
  'confidence.medium': 'Medium confidence',
  'confidence.low': 'Low confidence',
  'progress.label': 'Research material processing',
  'progress.count': '2 of 6 fields',
  'actions.retry': 'Retry',
  'actions.confirm': 'Confirm',
  'actions.edit': 'Edit',
  'actions.reject': 'Reject',
  'dropzone.label': 'Add research materials',
  'dropzone.hint': 'PDF, DOCX, TeX, Markdown, PNG, JPEG, WebP or SVG',
  'dropzone.browse': 'Choose files',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => labels[key] ?? key,
}));

import { Dropzone } from '../components/ui/dropzone';
import { EvidenceCard } from '../components/ui/evidence-card';
import { ProgressRail } from '../components/ui/progress-rail';
import { StatusBadge } from '../components/ui/status-badge';

const tokensCss = readFileSync(path.join(__dirname, '../app/tokens.css'), 'utf8');
const globalsCss = readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
const visualScript = readFileSync(path.join(__dirname, './visual/ingestion-shots.mjs'), 'utf8');

function parseRootTokens(source: string): Map<string, string> {
  const root = source.match(/:root\s*\{([\s\S]*?)\}/)?.[1];
  if (!root) throw new Error('tokens.css must expose a :root block');

  const result = new Map<string, string>();
  for (const match of root.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    result.set(match[1], match[2].trim());
  }
  return result;
}

function resolveToken(tokens: Map<string, string>, name: string, seen = new Set<string>()): string {
  if (seen.has(name)) throw new Error(`circular CSS token alias: --${name}`);
  const value = tokens.get(name);
  if (!value) throw new Error(`missing CSS token: --${name}`);
  const alias = value.match(/^var\(--([\w-]+)\)$/)?.[1];
  if (!alias) return value;
  return resolveToken(tokens, alias, new Set([...seen, name]));
}

function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string): number {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe('researcher ingestion foundations', () => {
  it('renders localized text labels for task and evidence states', () => {
    const markup = renderToStaticMarkup(
      createElement('div', null,
        createElement(StatusBadge, { status: 'needs_review' }),
        createElement(StatusBadge, { status: 'missing' }),
        createElement(StatusBadge, { status: 'confirmed' }),
      ),
    );

    expect(markup).toContain('Needs review');
    expect(markup).toContain('Missing');
    expect(markup).toContain('Confirmed');
    expect(markup).toContain('data-status="needs_review"');
  });

  it('keeps progress state geometry stable and exposes retry only when actionable', () => {
    const parsing = renderToStaticMarkup(
      createElement(ProgressRail, { current: 2, total: 6, state: 'parsing' }),
    );
    const failed = renderToStaticMarkup(
      createElement(ProgressRail, {
        current: 2,
        total: 6,
        state: 'failed_retryable',
        retry: () => undefined,
      }),
    );

    for (const markup of [parsing, failed]) {
      expect(markup).toContain('data-progress-rail="true"');
      expect(markup).toContain('min-h-32');
      expect(markup).toContain('data-progress-action');
      expect(markup).toContain('role="progressbar"');
      expect(markup).toContain('aria-valuenow="2"');
      expect(markup).toContain('motion-reduce:transition-none');
    }
    expect(parsing).not.toContain('>Retry</button>');
    expect(failed).toContain('>Retry</button>');
  });

  it('supports keyboard file selection with a visible focus ring and reduced-motion fallback', () => {
    const markup = renderToStaticMarkup(
      createElement(Dropzone, { onFiles: () => undefined }),
    );

    expect(markup).toContain('type="file"');
    expect(markup).toContain('multiple=""');
    expect(markup).toContain('focus-within:ring-2');
    expect(markup).toContain('motion-reduce:transition-none');
    expect(markup).toContain('Add research materials');
    expect(markup).toContain('Choose files');
  });

  it('renders an evidence-bearing paper surface with explicit decisions', () => {
    const markup = renderToStaticMarkup(
      createElement(EvidenceCard, {
        field: 'Method',
        value: 'Time-resolved photoelectron spectroscopy',
        status: 'inferred',
        confidence: 'high',
        source: 'methods.pdf · p. 4',
        onConfirm: () => undefined,
        onEdit: () => undefined,
        onReject: () => undefined,
      }),
    );

    expect(markup).toContain('bg-evidence-paper');
    expect(markup).toContain('Time-resolved photoelectron spectroscopy');
    expect(markup).toContain('methods.pdf · p. 4');
    expect(markup).toContain('High confidence');
    expect(markup).toContain('>Confirm</button>');
    expect(markup).toContain('>Edit</button>');
    expect(markup).toContain('>Reject</button>');
    expect(markup).not.toMatch(/(?:linear|radial)-gradient|from-|via-|to-/);
  });

  it('provides AA text pairings and a complete spacing/type/radius foundation', () => {
    const tokens = parseRootTokens(tokensCss);
    const pairs = [
      ['workbench-text', 'workbench-bg'],
      ['workbench-muted', 'workbench-bg'],
      ['evidence-ink', 'evidence-paper'],
      ['status-warning-text', 'status-warning-bg'],
      ['status-success-text', 'status-success-bg'],
      ['status-danger-text', 'status-danger-bg'],
    ] as const;

    for (const [foreground, background] of pairs) {
      expect(contrast(resolveToken(tokens, foreground), resolveToken(tokens, background))).toBeGreaterThanOrEqual(4.5);
    }
    for (const background of ['workbench-bg', 'evidence-paper']) {
      expect(
        contrast(resolveToken(tokens, 'focus-ring'), resolveToken(tokens, background)),
        `focus-ring must remain visible against ${background}`,
      ).toBeGreaterThanOrEqual(3);
    }
    for (const name of [
      'space-1', 'space-2', 'space-3', 'space-4', 'space-6', 'space-8',
      'font-size-xs', 'font-size-sm', 'font-size-base', 'font-size-lg',
      'radius-control', 'radius-card', 'radius-pill', 'focus-ring',
    ]) {
      expect(tokens.has(name), `missing --${name}`).toBe(true);
    }
  });

  it('limits motion to RO-node emphasis and disables it for reduced motion', () => {
    expect(globalsCss).toContain('.ro-node-motion');
    expect(globalsCss).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*?\.ro-node-motion/);
    expect(globalsCss).toContain('.surface-workbench');
    expect(globalsCss).toContain('.surface-evidence');
  });

  it('ships the same ingestion message contract in Chinese and English', () => {
    const zh = JSON.parse(readFileSync(path.join(__dirname, '../messages/zh.json'), 'utf8'));
    const en = JSON.parse(readFileSync(path.join(__dirname, '../messages/en.json'), 'utf8'));

    for (const messages of [zh, en]) {
      expect(messages.ingestion.status).toMatchObject({
        queued: expect.any(String),
        parsing: expect.any(String),
        needs_review: expect.any(String),
        confirmed: expect.any(String),
        failed_retryable: expect.any(String),
        missing: expect.any(String),
        inferred: expect.any(String),
      });
      expect(messages.ingestion.actions).toMatchObject({
        retry: expect.any(String),
        confirm: expect.any(String),
        edit: expect.any(String),
        reject: expect.any(String),
      });
    }
  });

  it('captures the real compiled primitive preview instead of a hand-written mock', () => {
    expect(visualScript).toContain('/_visual/ingestion-foundations');
    expect(visualScript).not.toContain('page.setContent');
  });
});
