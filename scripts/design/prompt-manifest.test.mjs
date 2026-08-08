import assert from 'node:assert/strict';
import test from 'node:test';

import { buildImagePrompt } from './prompt-manifest.mjs';

const approvedPromptManifest = `# Test prompt manifest

## MiniMax Prompt

\`\`\`text
Positive prompt line one.
Positive prompt line two.
\`\`\`

## Negative Prompt

\`\`\`text
No fabricated interface.
No orange light.
\`\`\`
`;

test('buildImagePrompt combines the approved positive and negative blocks in order', () => {
  assert.equal(
    buildImagePrompt(approvedPromptManifest),
    'Positive prompt line one.\nPositive prompt line two.\n\nConstraints to avoid:\nNo fabricated interface.\nNo orange light.',
  );
});

test('buildImagePrompt rejects a manifest without both required prompt sections', () => {
  assert.throws(
    () => buildImagePrompt('## MiniMax Prompt\n\n```text\nPositive prompt.\n```'),
    /Prompt manifest is missing MiniMax Prompt or Negative Prompt/,
  );
  assert.throws(
    () => buildImagePrompt('## Negative Prompt\n\n```text\nNo interface.\n```'),
    /Prompt manifest is missing MiniMax Prompt or Negative Prompt/,
  );
});
