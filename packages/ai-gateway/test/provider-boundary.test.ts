import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workspaceRoot = resolve(__dirname, '../../..');
const guardedRoots = ['apps/api/src', 'apps/web/app', 'apps/web/components', 'apps/web/lib', 'packages/domain/src'];
const forbiddenImport = /(?:from\s+|import\s*\()\s*['"](?:openai|@anthropic-ai\/sdk|@google\/generative-ai|minimax[^'"]*)['"]/;
const providerWireLiteral = /(?:\/v1\/coding_plan\/vlm|\/chat\/completions|anthropic-version|x-api-key)/;

function sourceFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('provider boundary', () => {
  it('keeps provider SDK imports and wire payloads out of API, Domain and Web', () => {
    const violations: string[] = [];
    for (const root of guardedRoots) {
      for (const file of sourceFiles(resolve(workspaceRoot, root))) {
        const source = readFileSync(file, 'utf8');
        if (forbiddenImport.test(source) || providerWireLiteral.test(source)) violations.push(file.replace(workspaceRoot, ''));
      }
    }
    expect(violations).toEqual([]);
  });
});
