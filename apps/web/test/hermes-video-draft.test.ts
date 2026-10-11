import { describe, expect, it } from 'vitest';
import { loadHermesPresentationDraft, saveHermesPresentationDraft, loadPendingHermesRunStart, savePendingHermesRunStart, readHermesResearchRunDraft } from '../lib/hermes/draft-state';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } } as Storage;
}
const presentationScope = { userId: 'user', researchObjectId: 'paper', versionId: 'version', purpose: 'presentation' as const };
const runScope = { userId: 'user', researchObjectId: 'paper', ingestionTaskId: 'source' };
const generation = { profile: 'visual-narrative-v1' as const, maxAgentTasks: 9 as const, locale: 'zh' as const, style: 'auto', instruction: 'Explain this paper' };

describe('video intent persistence', () => {
  it('retains the local request phase while preserving legacy drafts without one', () => {
    const storage = memoryStorage(); const pending = { key: 'run', generation, savedAt: 1 };
    for (const phase of ['source', 'run'] as const) {
      expect(savePendingHermesRunStart(storage, runScope, { ...pending, phase })).toBe(true);
      expect(loadPendingHermesRunStart(storage, runScope)).toEqual({ ...pending, phase });
    }
    savePendingHermesRunStart(storage, runScope, pending);
    expect(loadPendingHermesRunStart(storage, runScope)).toEqual(pending);
  });
  it('round trips the first video source request marker without inferring it for legacy keys', () => {
    const storage = memoryStorage(); const scope = { ...runScope, output: 'video' as const };
    const pending = { key: 'run-key', generation: { ...generation, output: 'video' as const }, savedAt: 1, sourceReanalysisKey: 'source-key' };
    expect(savePendingHermesRunStart(storage, scope, { ...pending, sourceReanalysisOutput: 'video' })).toBe(true);
    expect(loadPendingHermesRunStart(storage, scope)).toEqual({ ...pending, sourceReanalysisOutput: 'video' });
    expect(savePendingHermesRunStart(storage, scope, pending)).toBe(true);
    expect(loadPendingHermesRunStart(storage, scope)).toEqual(pending);
    expect(loadPendingHermesRunStart(storage, scope)).not.toHaveProperty('sourceReanalysisOutput');
  });
  it.each(['invalid', 'missing-key', 'image-scope'])('does not restore a broken source request marker (%s)', mode => {
    const storage = memoryStorage(); const scope = mode === 'image-scope' ? runScope : { ...runScope, output: 'video' as const };
    const pending = { key: 'run-key', generation: { ...generation, ...(mode === 'image-scope' ? {} : { output: 'video' as const }) }, savedAt: 1,
      ...(mode === 'missing-key' ? {} : { sourceReanalysisKey: 'source-key' }), sourceReanalysisOutput: mode === 'invalid' ? 'image' : 'video' };
    // A persisted draft is untrusted input, including drafts written by an older tab.
    savePendingHermesRunStart(storage, scope, pending as never);
    expect(loadPendingHermesRunStart(storage, scope)).toBeNull();
  });
  it('accepts only the server guide video intent or a legacy illustration draft', () => {
    const draft = {researchObjectId:'c896802c-35dd-4b59-8db1-5f374f83a6d8',ingestionTaskId:'d98862b0-0cf3-47a6-872f-1842a9308e7e',locale:'zh',style:'auto',instruction:'把这篇论文做成视频'};
    expect(readHermesResearchRunDraft({...draft,output:'video'})).toEqual({...draft,output:'video'});
    expect(readHermesResearchRunDraft(draft)).toEqual(draft);
    expect(readHermesResearchRunDraft({...draft,output:'image'})).toBeNull();
    expect(readHermesResearchRunDraft({...draft,output:'other'})).toBeNull();
  });
  it('retains an explicit local video revision without adding a scope to old drafts', () => {
    const storage = memoryStorage();
    const draft = { action: 'storyboard.revise' as const, instruction: 'Fix scene three', style: 'auto', language: 'zh' as const, selected: ['claim'], parentId: 'base', scene: 2, revisionSceneIndex: 2 };
    saveHermesPresentationDraft(storage, presentationScope, draft);
    expect(loadHermesPresentationDraft(storage, presentationScope)).toMatchObject(draft);
    const oldDraft = { ...draft, revisionSceneIndex: undefined };
    saveHermesPresentationDraft(storage, presentationScope, oldDraft);
    expect(loadHermesPresentationDraft(storage, presentationScope)).not.toHaveProperty('revisionSceneIndex');
  });
  it('rejects an invalid scene scope rather than restoring it as a full revision', () => {
    const storage = memoryStorage();
    saveHermesPresentationDraft(storage, presentationScope, { action:'storyboard.revise',instruction:'Fix one scene',style:'auto',language:'zh',selected:[],parentId:'base',scene:0,revisionSceneIndex:99 });
    expect(loadHermesPresentationDraft(storage, presentationScope)).toBeNull();
  });
  it('keeps image and video pending requests separate and preserves the video payload', () => {
    const storage = memoryStorage();
    const image = { key:'image-key',generation,savedAt:1 };
    const videoScope = { ...runScope, output:'video' as const };
    const video = { key:'video-key',generation:{...generation,output:'video' as const},savedAt:2 };
    expect(savePendingHermesRunStart(storage,runScope,image)).toBe(true);
    expect(savePendingHermesRunStart(storage,videoScope,video)).toBe(true);
    expect(loadPendingHermesRunStart(storage,runScope)).toEqual(image);
    expect(loadPendingHermesRunStart(storage,videoScope)).toEqual(video);
    expect(savePendingHermesRunStart(storage,videoScope,image)).toBe(false);
    expect(loadPendingHermesRunStart(storage,videoScope)).toEqual(video);
  });
});
