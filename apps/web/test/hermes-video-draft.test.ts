import { describe, expect, it } from 'vitest';
import { loadHermesPresentationDraft, saveHermesPresentationDraft, loadPendingHermesRunStart, savePendingHermesRunStart } from '../lib/hermes/draft-state';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } } as Storage;
}
const presentationScope = { userId: 'user', researchObjectId: 'paper', versionId: 'version', purpose: 'presentation' as const };
const runScope = { userId: 'user', researchObjectId: 'paper', ingestionTaskId: 'source' };
const generation = { profile: 'visual-narrative-v1' as const, maxAgentTasks: 9 as const, locale: 'zh' as const, style: 'auto', instruction: 'Explain this paper' };

describe('video intent persistence', () => {
  it('retains an explicit local video revision without adding a scope to old drafts', () => {
    const storage = memoryStorage();
    const draft = { action: 'storyboard.revise' as const, instruction: 'Fix scene three', style: 'auto', language: 'zh' as const, selected: ['claim'], parentId: 'base', scene: 2, revisionSceneIndex: 2 };
    saveHermesPresentationDraft(storage, presentationScope, draft);
    expect(loadHermesPresentationDraft(storage, presentationScope)).toMatchObject(draft);
    const { revisionSceneIndex: _unused, ...oldDraft } = draft;
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
