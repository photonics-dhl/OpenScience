import { fileURLToPath } from 'node:url';

export default {
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../../', import.meta.url)),
      '@openscience/domain/browser-result': fileURLToPath(new URL('../../../../packages/domain/src/retrieval/browser-result.ts', import.meta.url)),
    },
  },
};
