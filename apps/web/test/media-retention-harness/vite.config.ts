import { fileURLToPath } from 'node:url';

export default {
  define: { 'process.env': '{}' },
  esbuild: { jsx: 'automatic' },
  resolve: { alias: {
    '@': fileURLToPath(new URL('../../', import.meta.url)),
    '@openscience/domain/storyboard-visible-action': fileURLToPath(new URL('../../../../packages/domain/src/assets/storyboard-visible-action.ts', import.meta.url)),
  } },
};
