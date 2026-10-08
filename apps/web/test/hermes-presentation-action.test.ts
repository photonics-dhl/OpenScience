import { expect, it } from 'vitest';
import { selectPresentationVersion, presentationSources, SubmissionIntent, validPresentationInstruction, hasCurrentPresentationSources, newestEligibleStoryboard, presentationVideoFrameIds, presentationStoryboardRequest } from '../lib/hermes/presentation-action';
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

it('uses server-qualified native drafts without requiring intermediate user adoption', () => {
 const parent = { id:'native',kind:'interactive_html',status:'draft',updatedAt:'2026-10-08',canGenerateSceneImage:true,canGenerateVideo:true,sourceClaimIds:['claim'],
  videoFrameAssetIds:['frame-b','frame-a','frame-c'],storyboard:{output:'video',narrative:true,document:{scenes:[{},{},{}]}} } as PresentationAsset;
 expect(newestEligibleStoryboard([parent],'video.create')).toBe(parent);
 expect(newestEligibleStoryboard([parent],'scene.image')).toBe(parent);
 expect(presentationSources('scene.image',[],parent,1)).toEqual(['claim']);
 expect(newestEligibleStoryboard([{...parent,canGenerateVideo:false}],'video.create')).toBeUndefined();
 expect(newestEligibleStoryboard([{...parent,status:'rejected'}],'video.create')).toBeUndefined();
 const decoy = {id:'unreviewed',kind:'image',status:'approved',sceneImage:{storyboardAssetId:'native',sceneIndex:0}} as PresentationAsset;
 expect(presentationVideoFrameIds(parent,[decoy])).toEqual(['frame-b','frame-a','frame-c']);
 expect(presentationVideoFrameIds({...parent,videoFrameAssetIds:undefined},[decoy])).toEqual([]);
});

it('keeps native video and local scene scope in the submitted storyboard request', () => {
 const parent = {id:'base',storyboard:{output:'video'}} as PresentationAsset;
 expect(presentationStoryboardRequest({action:'storyboard.create',output:'video',locale:'en',style:'auto',instruction:'Explain this paper'})).toEqual({
  output:'video',narrative:true,locale:'en',style:'auto',instruction:'Explain this paper',
 });
 expect(presentationStoryboardRequest({action:'storyboard.revise',output:'image',locale:'en',style:'auto',instruction:'Fix scene three',parent,revisionSceneIndex:2})).toEqual({
  output:'video',narrative:true,locale:'en',style:'auto',instruction:'Fix scene three',baseAssetId:'base',revisionSceneIndex:2,
 });
 expect(presentationStoryboardRequest({action:'storyboard.create',output:'image',locale:'zh',style:'ink',instruction:'Draw the mechanism',revisionSceneIndex:2})).toEqual({
  output:'image',locale:'zh',style:'ink',instruction:'Draw the mechanism',
 });
});

it('preserves the existing legacy manual frame order without applying it to native drafts', () => {
 const parent = {id:'legacy',canGenerateVideo:true,storyboard:{output:'video',document:{scenes:[{},{},{}]}}} as PresentationAsset;
 const frames = [2,0,1].map(index => ({id:`frame-${index}`,kind:'image',status:'approved',sceneImage:{storyboardAssetId:'legacy',sceneIndex:index}} as PresentationAsset));
 expect(presentationVideoFrameIds(parent,frames)).toEqual(['frame-0','frame-1','frame-2']);
 expect(presentationVideoFrameIds({...parent,canGenerateVideo:false},frames)).toEqual([]);
});
