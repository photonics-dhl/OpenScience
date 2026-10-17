import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const drawerPath = fileURLToPath(new URL('../../components/hermes/HermesAssistantDrawer.tsx', import.meta.url)).replaceAll('\\', '/');
const readerWriter = 'export function buildGuidePresentationContext(input: GuidePresentationInput): GuidePresentationResolution {\n  return legacyGuidePresentationContext(input);\n}';
const currentWriter = readerWriter.replace('return legacyGuidePresentationContext(input);', 'return selectedGuidePresentationContext(input);');

export default {
  define: { 'process.env': '{}' },
  esbuild: { jsx: 'automatic' },
  plugins: [{ name: 'selected-guide-writer-fixture', enforce: 'pre', load(id: string) {
    if (id !== drawerPath && id !== `${drawerPath}?selected-guide-W`) return null;
    const writer = id !== drawerPath;
    const source = writer ? readFileSync(drawerPath, 'utf8') : execFileSync('git',
      ['show', '2877a739d39f3b6fe304096b7c8a9ad01ee6b76c:apps/web/components/hermes/HermesAssistantDrawer.tsx'],
      { cwd: fileURLToPath(new URL('../../../../', import.meta.url)), encoding: 'utf8' });
    const expected = writer ? currentWriter : readerWriter;
    const original = source.includes(expected) ? expected : expected.replaceAll('\n', '\r\n');
    if (source.split(original).length !== 2) throw new Error('The actual reader/writer guide binding changed; update the stage fixture explicitly.');
    return source;
  } }],
  resolve: { alias: {
    '@': fileURLToPath(new URL('../../', import.meta.url)),
    '@openscience/domain/browser-result': fileURLToPath(new URL('../../../../packages/domain/src/retrieval/browser-result.ts', import.meta.url)),
    '@openscience/domain/canonical-evidence-contract': fileURLToPath(new URL('../../../../packages/domain/src/ingestion/canonical-evidence-contract.ts', import.meta.url)),
    '@openscience/domain/workspace-guide-contract': fileURLToPath(new URL('../../../../packages/domain/src/agent/workspace-guide-contract.ts', import.meta.url)),
    '@openscience/domain/storyboard-visible-action': fileURLToPath(new URL('../../../../packages/domain/src/assets/storyboard-visible-action.ts', import.meta.url)),
  } },
};
