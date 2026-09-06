import { expect, it } from 'vitest';
import { selectPresentationVersion, presentationSources, SubmissionIntent, validPresentationInstruction, hasCurrentPresentationSources } from '../lib/hermes/presentation-action';
import type { VersionSummary, PresentationAsset, PresentationClaim } from '../lib/api';
const versions = [{versionId:'published',status:'published'},{versionId:'draft',status:'draft'}] as VersionSummary[];
it('never substitutes an explicit version and defaults only to a draft',()=>{
 expect(selectPresentationVersion(versions,'missing')).toBeNull();
 expect(selectPresentationVersion(versions,'published')?.status).toBe('published');
 expect(selectPresentationVersion(versions)?.versionId).toBe('draft');
});
it('inherits exact parent claims and rejects unauthorized images',()=>{
 const parent={id:'p',status:'approved',canGenerateSceneImage:true,sourceClaimIds:['b','a'],storyboard:{document:{scenes:[{}]}}} as PresentationAsset;
 expect(presentationSources('scene.image',['x'],parent,0)).toEqual(['b','a']);
 expect(presentationSources('storyboard.revise',['x'],parent)).toEqual(['b','a']);
 expect(presentationSources('scene.image',[],{...parent,canGenerateSceneImage:false},0)).toEqual([]);
 expect(presentationSources('scene.image',[],parent,1)).toEqual([]);
 expect(presentationSources('storyboard.create',Array.from({length:13},(_,i)=>String(i)))).toEqual([]);
});
it('locks duplicates, preserves ambiguous exact request and permits explicit retry only',()=>{
 const intent=new SubmissionIntent();
 const key=intent.begin('a'); expect(key).toBeTruthy(); expect(intent.begin('a')).toBeNull();
 intent.fail(true); expect(intent.begin('b')).toBeNull(); expect(intent.begin('a')).toBe(key);
 intent.fail(false); expect(intent.begin('b')).toBeTruthy();
});

it('retains request snapshot across mounted owners and settles known success',()=>{
 const records=new Map<string,SubmissionIntent>(); const record=new SubmissionIntent(); records.set('ro:version',record);
 const key=record.begin('exact'); record.draft={action:'storyboard.revise',instruction:'shorter',style:'ink',selected:[],parentId:'parent',scene:0}; record.fail(true);
 const restored=records.get('ro:version')!; expect(restored.isUncertain).toBe(true); expect(restored.draft?.parentId).toBe('parent'); expect(restored.begin('exact')).toBe(key);
 restored.complete(); expect(restored.isBusy).toBe(false); expect(restored.isUncertain).toBe(false);
});

it('blocks rejected parents, unsuccessful sources and overlong instructions',()=>{
 const parent={status:'rejected',sourceClaimIds:['a'],storyboard:{}} as PresentationAsset;
 expect(presentationSources('storyboard.revise',[],parent)).toEqual([]);
 expect(hasCurrentPresentationSources(['a'],[{id:'a',extractionStatus:'failed'}] as PresentationClaim[])).toBe(false);
 expect(hasCurrentPresentationSources(['a'],[{id:'a',extractionStatus:'succeeded'}] as PresentationClaim[])).toBe(true);
 expect(validPresentationInstruction('x'.repeat(1000))).toBe(true);
 expect(validPresentationInstruction('x'.repeat(1001))).toBe(false);
});
