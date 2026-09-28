import { expect, it } from 'vitest';
import { projectAgentTaskResult } from '../../src/agent/agent';

it('never projects private rejected scientific candidates into an API task result', () => {
  expect(projectAgentTaskResult({ assetId: 'asset', storyboardScienceDiagnostics: {
    candidates: [{ text: 'unreviewed private manuscript excerpt' }], sources: ['private source'],
  } }, 'presentation.generate')).toEqual({ assetId: 'asset' });
});
