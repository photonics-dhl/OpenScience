import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const drawerPath = fileURLToPath(new URL('../../components/hermes/HermesAssistantDrawer.tsx', import.meta.url)).replaceAll('\\', '/');
const readerWriter = 'export function buildGuidePresentationContext(input: GuidePresentationInput): GuidePresentationResolution {\n  return legacyGuidePresentationContext(input);\n}';

export default {
  define: { 'process.env': '{}' },
  esbuild: { jsx: 'automatic' },
  plugins: [{ name: 'selected-guide-writer-fixture', enforce: 'pre', load(id: string) {
    if (id !== `${drawerPath}?selected-guide-W`) return null;
    const source = readFileSync(drawerPath, 'utf8');
    const original = source.includes(readerWriter) ? readerWriter : readerWriter.replaceAll('\n', '\r\n');
    if (source.split(original).length !== 2) throw new Error('The exact production guide writer changed; selected-guide-W must be updated explicitly.');
    return source.replace(original, original.replace('return legacyGuidePresentationContext(input);', 'return selectedGuidePresentationContext(input);'));
  } }],
  resolve: { alias: {
    '@': fileURLToPath(new URL('../../', import.meta.url)),
    '@openscience/domain/workspace-guide-contract': fileURLToPath(new URL('../../../../packages/domain/src/agent/workspace-guide-contract.ts', import.meta.url)),
    '@openscience/domain/storyboard-visible-action': fileURLToPath(new URL('../../../../packages/domain/src/assets/storyboard-visible-action.ts', import.meta.url)),
  } },
};
