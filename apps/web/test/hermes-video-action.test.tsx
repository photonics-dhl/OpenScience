import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getCurrentUser:vi.fn(),getResearchObject:vi.fn(),listVersions:vi.fn(),listMyWorkspaces:vi.fn(),listVersionClaims:vi.fn(),listPresentationAssets:vi.fn(),
  getHermesVideoCapability:vi.fn(),generatePresentationSceneImage:vi.fn(),generatePresentationStoryboard:vi.fn(),generatePresentationVideo:vi.fn(),
  ApiClientError:class extends Error { constructor(readonly code:string,message:string,readonly status:number) {super(message);} } }));
const copy = vi.hoisted(() => Object.assign((key:string) => key,{has:() => false}));
vi.mock('@/lib/api', () => api);
vi.mock('next-intl', () => ({useLocale:() => 'en',useTranslations:() => copy}));
vi.mock('@/components/research/useVersionLabels', () => ({useVersionLabels:() => ({label:() => 'Private draft'})}));
vi.mock('@/lib/hermes/draft-state', () => ({getHermesDraftStorage:() => null,loadHermesPresentationDraft:() => null,saveHermesPresentationDraft:vi.fn()}));
vi.mock('react', async original => ({...await original<typeof React>(),useState:vi.fn(),useRef:vi.fn(),useEffect:vi.fn()}));
import { HermesPresentationAction } from '../components/hermes/HermesPresentationAction';
import type { HermesConversationAction } from '../lib/hermes/conversation-action';
import { SubmissionIntent } from '../lib/hermes/presentation-action';

type EventProps = { children?:React.ReactNode; disabled?:boolean; role?:string; type?:string; onChange?:(event:{target:{value:string}}) => void; onClick?:() => void; onSubmit?:(event:{preventDefault():void}) => Promise<void> };
function find(node:React.ReactNode, match:(element:React.ReactElement<EventProps>) => boolean):React.ReactElement<EventProps> {
  if (React.isValidElement<EventProps>(node)) {
    if (match(node)) return node;
    for (const child of React.Children.toArray(node.props.children)) { try { return find(child,match); } catch { /* next sibling */ } }
  }
  throw new Error('Control missing');
}

// Run the actual component's effects and event handlers in the existing Node
// hook-host style. This proves request/state behavior, not browser rendering.
type Props = Parameters<typeof HermesPresentationAction>[0];
function mount(intent:Props['intent'], conversation=false, overrides:Partial<Props>={}) {
  const states:unknown[]=[]; const refs:Array<{current:unknown}>=[];
  const previousDeps:Array<React.DependencyList | undefined>=[];
  const cleanups:Array<(() => void) | undefined>=[];
  const jobs:Array<() => void>=[];
  let stateIndex=0,refIndex=0,effectIndex=0,dirty=true,unmounted=false;
  let tree:React.ReactNode;
  let action:HermesConversationAction | null=null;
  const props={researchObjectId:'paper',requestedVersionId:'version',userId:'actor-a',intent,onBack:vi.fn(),onSubmitted:vi.fn(),
    onConfirmationChange:conversation ? (next:HermesConversationAction | null) => {action=next;} : undefined,...overrides};
  vi.mocked(React.useState).mockImplementation((<T,>(initial:T | (() => T)) => {
    const index=stateIndex++;
    if (!(index in states)) states[index]=typeof initial === 'function' ? (initial as () => T)() : initial;
    return [states[index],(next:T | ((old:T) => T)) => { const value=typeof next === 'function' ? (next as (old:T) => T)(states[index] as T) : next; if (!Object.is(value,states[index])) {states[index]=value;dirty=true;} }];
  }) as typeof React.useState);
  vi.mocked(React.useRef).mockImplementation((<T,>(initial:T) => refs[refIndex++] ??= {current:initial}) as typeof React.useRef);
  vi.mocked(React.useEffect).mockImplementation((effect,deps) => {
    const index=effectIndex++; const previous=previousDeps[index];
    if (previous && deps && previous.length===deps.length && deps.every((value,i) => Object.is(value,previous[i]))) return;
    previousDeps[index]=deps; jobs.push(() => {cleanups[index]?.();const cleanup=effect();cleanups[index]=typeof cleanup==='function' ? cleanup : undefined;});
  });
  return {
    tree:() => tree,
    props,
    confirmation:() => action,
    update(next:Partial<Props>) {Object.assign(props,next);dirty=true;},
    unmount() {unmounted=true;for (const cleanup of cleanups) cleanup?.();},
    async submit() {await find(tree,element => element.type==='form').props.onSubmit!({preventDefault(){}});},
    async confirm() { if (!action?.ready) throw new Error('Conversation action is not ready'); await action.confirm(); },
    async flush() {
      if (unmounted) return;
      for (let pass=0;pass<12;pass++) {
        if (dirty) {dirty=false;stateIndex=0;refIndex=0;effectIndex=0;tree=HermesPresentationAction(props);}
        for (const job of jobs.splice(0)) job();
        await Promise.resolve(); await Promise.resolve();
        if (!dirty && !jobs.length) return;
      }
      throw new Error('Component did not settle');
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getCurrentUser.mockResolvedValue({userId:'actor-a'});
  api.getHermesVideoCapability.mockResolvedValue({canGenerateVideo:true});
  api.getResearchObject.mockResolvedValue({researchObject:{workspaceId:'workspace',title:'Paper'}});
  api.listVersions.mockResolvedValue({versions:[{versionId:'version',status:'draft'}]});
  api.listMyWorkspaces.mockResolvedValue([{id:'workspace',status:'active',role:'author'}]);
  api.listVersionClaims.mockResolvedValue({claims:[{id:'claim',researchObjectId:'paper',versionId:'version',extractionStatus:'succeeded',updatedAt:'2026-10-08'}]});
  api.listPresentationAssets.mockResolvedValue({assets:[{id:'plan',researchObjectId:'paper',versionId:'version',kind:'interactive_html',status:'draft',updatedAt:'2026-10-08',sourceClaimIds:['claim'],
    canGenerateVideo:true,canGenerateSceneImage:true,videoFrameAssetIds:['f2','f1','f3'],storyboard:{output:'video',narrative:true,document:{scenes:[{title:'First'},{title:'Second'},{title:'Third'}]}}}]});
  for (const generate of [api.generatePresentationSceneImage,api.generatePresentationStoryboard,api.generatePresentationVideo]) generate.mockResolvedValue({task:{id:'task'}});
});
afterEach(() => vi.restoreAllMocks());

function deferred<T>() {
  let resolve!:(value:T) => void;
  let reject!:(cause:unknown) => void;
  const promise=new Promise<T>((yes,no) => {resolve=yes;reject=no;});
  return {promise,resolve,reject};
}

function unknownSubmission(action:'video.create' | 'storyboard.revise', actor='actor-a') {
  const record=new SubmissionIntent();
  const payload=action==='video.create'
    ? {profile:'content-driven-v1' as const,storyboardAssetId:'original-plan',sceneImageAssetIds:['original-c','original-a','original-b']}
    : {locale:'en' as const,style:'ink',output:'video' as const,narrative:true as const,instruction:'Original revision',baseAssetId:'original-plan',revisionSceneIndex:2};
  const sourceIds=['claim-2','claim'];
  const key=record.begin(JSON.stringify(['paper','version',action,sourceIds,payload]));
  record.draft={action,instruction:action==='video.create' ? '' : 'Original revision',style:'ink',selected:sourceIds,parentId:'original-plan',scene:0};
  record.request={action,sourceIds,payload};record.fail(true);
  api.listVersionClaims.mockResolvedValue({claims:sourceIds.map(id => ({id,researchObjectId:'paper',versionId:'version',extractionStatus:'succeeded',updatedAt:'2026-10-08'}))});
  return {record,key,payload,sourceIds,records:new Map([[`${actor}:paper:version:${action}`,record]])};
}

describe('native video controls', () => {
  it('keeps an image scene intent eligible without treating it as a video revision scope', async () => {
    const host=mount({action:'scene.image',instruction:'',sceneIndex:1}); await host.flush();
    await find(host.tree(),element => element.type==='form').props.onSubmit!({preventDefault(){}});
    expect(api.generatePresentationSceneImage).toHaveBeenCalledWith('paper','version',['claim'],{storyboardAssetId:'plan',sceneIndex:1},expect.any(String),expect.any(AbortSignal));
    expect(api.generatePresentationStoryboard).not.toHaveBeenCalled();
    expect(api.getHermesVideoCapability).not.toHaveBeenCalled();
  });
  it('sends the selected third video scene as an explicit bounded revision', async () => {
    const host=mount({action:'storyboard.revise',instruction:'Fix this plan',baseAssetId:'plan'},true); await host.flush();
    const label=find(host.tree(),element => element.type==='label' && React.Children.toArray(element.props.children).includes('videoRevision.label'));
    find(label,element => element.type==='select').props.onChange!({target:{value:'2'}}); await host.flush();
    await host.confirm();
    expect(api.generatePresentationStoryboard).toHaveBeenCalledWith('paper','version',['claim'],expect.objectContaining({output:'video',narrative:true,baseAssetId:'plan',revisionSceneIndex:2}),expect.any(String),expect.any(AbortSignal));
  });
  it('clears video scope when the user switches to an image', async () => {
    const host=mount({action:'storyboard.revise',instruction:'Fix this plan',baseAssetId:'plan'},true); await host.flush();
    const label=find(host.tree(),element => element.type==='label' && React.Children.toArray(element.props.children).includes('videoRevision.label'));
    find(label,element => element.type==='select').props.onChange!({target:{value:'2'}}); await host.flush();
    find(host.tree(),element => element.type==='button' && element.props.children==='image').props.onClick!(); await host.flush();
    await host.confirm();
    const request=api.generatePresentationStoryboard.mock.calls[0]?.[3];
    expect(request).toMatchObject({output:'image'});
    expect(request).not.toHaveProperty('revisionSceneIndex');
    expect(request).not.toHaveProperty('baseAssetId');
  });
  it('submits the server-qualified frame order from the registered conversation action', async () => {
    const host=mount({action:'video.create',instruction:'',baseAssetId:'plan'},true); await host.flush();
    await host.confirm();
    expect(api.getHermesVideoCapability).toHaveBeenCalledWith('paper',expect.any(AbortSignal));
    expect(api.generatePresentationVideo).toHaveBeenCalledWith('paper','version',['claim'],{profile:'content-driven-v1',storyboardAssetId:'plan',sceneImageAssetIds:['f2','f1','f3']},expect.any(String),expect.any(AbortSignal));
  });

  it.each([
    {name:'video',intent:{action:'video.create' as const,instruction:'',baseAssetId:'plan'},withoutPlan:false},
    {name:'new video plan',intent:{action:'video.create' as const,instruction:'Explain the paper'},withoutPlan:true},
    {name:'video plan revision',intent:{action:'storyboard.revise' as const,instruction:'Fix this plan',baseAssetId:'plan'},withoutPlan:false},
  ])('rejects an unavailable fresh $name before allocating a key or posting', async ({intent,withoutPlan}) => {
    api.getHermesVideoCapability.mockResolvedValue({canGenerateVideo:false});
    if (withoutPlan) api.listPresentationAssets.mockResolvedValue({assets:[]});
    const records=new Map<string,SubmissionIntent>();
    const key=vi.spyOn(crypto,'randomUUID');
    const host=mount(intent,false,{submissionRecords:records});await host.flush();
    await host.submit();await host.flush();
    expect(api.getHermesVideoCapability).toHaveBeenCalledWith('paper',expect.any(AbortSignal));
    expect(key).not.toHaveBeenCalled();expect(records.size).toBe(0);
    expect(api.generatePresentationVideo).not.toHaveBeenCalled();
    expect(api.generatePresentationStoryboard).not.toHaveBeenCalled();
    expect(api.generatePresentationSceneImage).not.toHaveBeenCalled();
    expect(find(host.tree(),element => element.props.role==='alert').props.children).toBe('videoUnavailable');
    expect(find(host.tree(),element => element.type==='button' && element.props.type==='submit').props.disabled).toBe(false);
    await host.submit();
    expect(api.getHermesVideoCapability).toHaveBeenCalledTimes(2);
    expect(key).not.toHaveBeenCalled();
  });

  it.each([new Error('GET disconnected'),new api.ApiClientError('UNAVAILABLE','GET failed',503)])('keeps failed capability reads outside paid uncertainty: %s', async cause => {
    api.getHermesVideoCapability.mockRejectedValue(cause);
    const records=new Map<string,SubmissionIntent>();const key=vi.spyOn(crypto,'randomUUID');
    const host=mount({action:'video.create',instruction:'',baseAssetId:'plan'},true,{submissionRecords:records});await host.flush();
    await host.confirm();await host.flush();
    expect(key).not.toHaveBeenCalled();expect(records.size).toBe(0);
    expect(api.generatePresentationVideo).not.toHaveBeenCalled();
    expect(api.generatePresentationStoryboard).not.toHaveBeenCalled();
    expect(find(host.tree(),element => element.props.role==='alert').props.children).toBe('videoAvailabilityError');
    expect(host.confirmation()?.ready).toBe(true);
  });

  it('waits for a fresh GET before planning and blocks duplicate confirmation during preflight', async () => {
    const capability=deferred<{canGenerateVideo:boolean}>();
    api.getHermesVideoCapability.mockReturnValue(capability.promise);
    api.listPresentationAssets.mockResolvedValue({assets:[]});
    const records=new Map<string,SubmissionIntent>();const key=vi.spyOn(crypto,'randomUUID');
    const host=mount({action:'video.create',instruction:'Explain the paper'},true,{submissionRecords:records});await host.flush();
    const confirm=host.confirmation()!.confirm;
    const first=confirm();await confirm();await host.flush();
    expect(api.getHermesVideoCapability).toHaveBeenCalledTimes(1);
    expect(host.confirmation()?.ready).toBe(false);
    expect(key).not.toHaveBeenCalled();expect(records.size).toBe(0);
    expect(api.generatePresentationStoryboard).not.toHaveBeenCalled();
    capability.resolve({canGenerateVideo:true});await first;await host.flush();
    expect(api.generatePresentationStoryboard).toHaveBeenCalledTimes(1);
    expect(api.generatePresentationStoryboard).toHaveBeenCalledWith('paper','version',['claim'],{
      locale:'en',style:'auto',output:'video',narrative:true,instruction:'Explain the paper',
    },expect.any(String),api.getHermesVideoCapability.mock.calls[0][1]);
    expect(key).toHaveBeenCalledTimes(1);
    expect(api.getHermesVideoCapability.mock.invocationCallOrder[0]).toBeLessThan(key.mock.invocationCallOrder[0]);
    expect(key.mock.invocationCallOrder[0]).toBeLessThan(api.generatePresentationStoryboard.mock.invocationCallOrder[0]);
    expect(host.props.onSubmitted).toHaveBeenCalledTimes(1);
  });

  it.each(['video.create','storyboard.revise'] as const)('replays an existing unknown %s with its exact action, sources, payload and key', async action => {
    const saved=unknownSubmission(action);const key=vi.spyOn(crypto,'randomUUID');
    api.getHermesVideoCapability.mockResolvedValue({canGenerateVideo:false});
    const host=mount({action:'storyboard.create',instruction:'New instruction',style:'technical'},true,{submissionRecords:saved.records});await host.flush();
    await host.confirm();
    const generate=action==='video.create' ? api.generatePresentationVideo : api.generatePresentationStoryboard;
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith('paper','version',saved.sourceIds,saved.payload,saved.key,expect.any(AbortSignal));
    expect(api.getHermesVideoCapability).not.toHaveBeenCalled();expect(key).not.toHaveBeenCalled();
    expect(saved.record.isUncertain).toBe(false);expect(saved.records.size).toBe(0);
  });

  it('keeps a fresh VIDEO_UNAVAILABLE refusal known and checks availability again on the next attempt', async () => {
    api.generatePresentationVideo.mockRejectedValue(new api.ApiClientError('VIDEO_UNAVAILABLE','Disabled after GET',503));
    const records=new Map<string,SubmissionIntent>();
    const host=mount({action:'video.create',instruction:'',baseAssetId:'plan'},true,{submissionRecords:records});await host.flush();
    await host.confirm();await host.flush();
    expect(records.get('actor-a:paper:version:video.create')?.isUncertain).toBe(false);
    expect(find(host.tree(),element => element.props.role==='alert').props.children).toBe('videoUnavailable');
    expect(host.confirmation()?.ready).toBe(true);
    api.getHermesVideoCapability.mockResolvedValue({canGenerateVideo:false});
    await host.confirm();
    expect(api.getHermesVideoCapability).toHaveBeenCalledTimes(2);
    expect(api.generatePresentationVideo).toHaveBeenCalledTimes(1);
  });

  it.each(['video.create','storyboard.revise'] as const)('preserves an older unknown %s when its replay returns VIDEO_UNAVAILABLE', async action => {
    const saved=unknownSubmission(action);const key=vi.spyOn(crypto,'randomUUID');
    api.getHermesVideoCapability.mockRejectedValue(new Error('Unavailable GET'));
    const generate=action==='video.create' ? api.generatePresentationVideo : api.generatePresentationStoryboard;
    generate.mockRejectedValueOnce(new api.ApiClientError('VIDEO_UNAVAILABLE','Disabled',409));
    const host=mount({action:'storyboard.create',instruction:'Changed'},true,{submissionRecords:saved.records});await host.flush();
    await host.confirm();await host.flush();
    expect(saved.record.isUncertain).toBe(true);expect(saved.record.isBusy).toBe(false);
    expect(saved.record.request).toEqual({action,sourceIds:saved.sourceIds,payload:saved.payload});
    expect(find(host.tree(),element => element.props.role==='alert').props.children).toBe('uncertain');
    await host.confirm();
    expect(generate).toHaveBeenCalledTimes(2);
    for (const call of generate.mock.calls) expect(call.slice(0,5)).toEqual(['paper','version',saved.sourceIds,saved.payload,saved.key]);
    expect(api.getHermesVideoCapability).not.toHaveBeenCalled();expect(key).not.toHaveBeenCalled();
  });

  it('retains the original unknown POST recovery without a new preflight or key', async () => {
    api.generatePresentationVideo.mockRejectedValueOnce(new Error('POST disconnected'));
    const records=new Map<string,SubmissionIntent>();const key=vi.spyOn(crypto,'randomUUID');
    const host=mount({action:'video.create',instruction:'',baseAssetId:'plan'},true,{submissionRecords:records});await host.flush();
    await host.confirm();await host.flush();
    expect(records.get('actor-a:paper:version:video.create')?.isUncertain).toBe(true);
    expect(find(host.tree(),element => element.props.role==='alert').props.children).toBe('uncertain');
    api.getHermesVideoCapability.mockResolvedValue({canGenerateVideo:false});
    await host.confirm();
    expect(api.getHermesVideoCapability).toHaveBeenCalledTimes(1);expect(key).toHaveBeenCalledTimes(1);
    expect(api.generatePresentationVideo).toHaveBeenCalledTimes(2);
    expect(api.generatePresentationVideo.mock.calls[1].slice(0,5)).toEqual(api.generatePresentationVideo.mock.calls[0].slice(0,5));
  });

  it.each(['source change','actor change','unmount'])('aborts a pending capability read on %s without creating paid uncertainty', async change => {
    const capability=deferred<{canGenerateVideo:boolean}>();api.getHermesVideoCapability.mockReturnValue(capability.promise);
    const records=new Map<string,SubmissionIntent>();const key=vi.spyOn(crypto,'randomUUID');
    const host=mount({action:'video.create',instruction:'',baseAssetId:'plan'},true,{submissionRecords:records});await host.flush();
    const pending=host.confirm();await host.flush();
    const signal=api.getHermesVideoCapability.mock.calls[0]?.[1] as AbortSignal;
    expect(signal).toBeInstanceOf(AbortSignal);
    if (change==='unmount') host.unmount();else {host.update(change==='actor change' ? {userId:'actor-b'} : {researchObjectId:'another-paper'});await host.flush();}
    expect(signal.aborted).toBe(true);
    capability.resolve({canGenerateVideo:true});await pending;await host.flush();
    expect(records.size).toBe(0);expect(key).not.toHaveBeenCalled();
    expect(api.generatePresentationVideo).not.toHaveBeenCalled();expect(api.generatePresentationStoryboard).not.toHaveBeenCalled();
    expect(host.props.onSubmitted).not.toHaveBeenCalled();
  });

  it.each(['source change','actor change','unmount'])('preserves an already submitted POST as unknown on %s', async change => {
    const task=deferred<{task:{id:string}}>();api.generatePresentationVideo.mockReturnValue(task.promise);
    const records=new Map<string,SubmissionIntent>();
    const host=mount({action:'video.create',instruction:'',baseAssetId:'plan'},true,{submissionRecords:records});await host.flush();
    const pending=host.confirm();await host.flush();
    expect(api.generatePresentationVideo).toHaveBeenCalledTimes(1);
    const signal=api.generatePresentationVideo.mock.calls[0][5] as AbortSignal;
    const record=records.get('actor-a:paper:version:video.create')!;
    const request=record.request;
    expect(record.isBusy).toBe(true);
    if (change==='unmount') host.unmount();else {host.update(change==='actor change' ? {userId:'actor-b'} : {researchObjectId:'another-paper'});await host.flush();}
    expect(signal.aborted).toBe(true);expect(record.isBusy).toBe(false);expect(record.isUncertain).toBe(true);
    task.resolve({task:{id:'late-task'}});await pending;
    expect(record.request).toEqual(request);expect(record.isUncertain).toBe(true);
    expect(host.props.onSubmitted).not.toHaveBeenCalled();
  });

  it('waits for the new actor workspace role instead of reusing the previous writable bootstrap', async () => {
    const records=new Map<string,SubmissionIntent>();const key=vi.spyOn(crypto,'randomUUID');
    const host=mount({action:'video.create',instruction:'',baseAssetId:'plan'},true,{submissionRecords:records});await host.flush();
    expect(host.confirmation()?.ready).toBe(true);
    const oldConfirm=host.confirmation()!.confirm;
    const workspaces=deferred<Array<{id:string;status:string;role:string}>>();api.listMyWorkspaces.mockReturnValueOnce(workspaces.promise);
    api.getCurrentUser.mockResolvedValue({userId:'actor-b'});
    host.update({userId:'actor-b'});await host.flush();
    expect(host.confirmation()?.ready).toBe(false);
    await oldConfirm();
    expect(api.getHermesVideoCapability).not.toHaveBeenCalled();expect(api.getCurrentUser).not.toHaveBeenCalled();
    workspaces.resolve([{id:'workspace',status:'active',role:'viewer'}]);await host.flush();
    expect(host.confirmation()?.ready).toBe(false);await host.confirmation()!.confirm();
    expect(api.listMyWorkspaces).toHaveBeenCalledTimes(2);
    expect(api.generatePresentationVideo).not.toHaveBeenCalled();expect(key).not.toHaveBeenCalled();expect(records.size).toBe(0);
  });

  it('waits for new actor sources even when the RO, version and writable role are unchanged', async () => {
    const host=mount({action:'video.create',instruction:'',baseAssetId:'plan'},true);await host.flush();
    const oldClaimSignal=api.listVersionClaims.mock.calls[0][2] as AbortSignal;
    const sources=deferred<{claims:unknown[]}>();api.listVersionClaims.mockReturnValueOnce(sources.promise);
    api.getCurrentUser.mockResolvedValue({userId:'actor-b'});
    host.update({userId:'actor-b'});await host.flush();
    expect(oldClaimSignal.aborted).toBe(true);expect(host.confirmation()?.ready).toBe(false);
    await host.confirmation()!.confirm();
    expect(api.generatePresentationVideo).not.toHaveBeenCalled();expect(api.getHermesVideoCapability).not.toHaveBeenCalled();
    sources.resolve({claims:[{id:'claim',researchObjectId:'paper',versionId:'version',extractionStatus:'succeeded',updatedAt:'2026-10-08'}]});await host.flush();
    expect(host.confirmation()?.ready).toBe(true);await host.confirm();
    expect(api.getCurrentUser).toHaveBeenCalledWith({fresh:true});expect(api.generatePresentationVideo).toHaveBeenCalledTimes(1);
  });

  it('leaves another actor unknown untouched and restores it only when that actor returns', async () => {
    const saved=unknownSubmission('video.create');const key=vi.spyOn(crypto,'randomUUID');
    const host=mount({action:'storyboard.create',instruction:'New instruction'},true,{submissionRecords:saved.records});await host.flush();
    api.getCurrentUser.mockResolvedValue({userId:'actor-b'});api.getHermesVideoCapability.mockResolvedValue({canGenerateVideo:false});
    host.update({userId:'actor-b',intent:{action:'video.create',instruction:'',baseAssetId:'plan'}});await host.flush();
    expect(host.confirmation()?.ready).toBe(true);await host.confirm();await host.flush();
    expect(api.getHermesVideoCapability).toHaveBeenCalledTimes(1);expect(api.generatePresentationVideo).not.toHaveBeenCalled();
    expect(find(host.tree(),element => element.props.role==='alert').props.children).toBe('videoUnavailable');
    expect(saved.records.get('actor-a:paper:version:video.create')).toBe(saved.record);
    expect(saved.record.isUncertain).toBe(true);expect(saved.record.request).toEqual({action:'video.create',sourceIds:saved.sourceIds,payload:saved.payload});
    expect(key).not.toHaveBeenCalled();
    api.getCurrentUser.mockResolvedValue({userId:'actor-a'});
    host.update({userId:'actor-a',intent:{action:'storyboard.create',instruction:'Changed again'}});await host.flush();await host.confirm();
    expect(api.generatePresentationVideo).toHaveBeenCalledWith('paper','version',saved.sourceIds,saved.payload,saved.key,expect.any(AbortSignal));
    expect(api.getHermesVideoCapability).toHaveBeenCalledTimes(1);expect(key).not.toHaveBeenCalled();expect(saved.records.size).toBe(0);
  });

  it.each([
    {name:'scene image',intent:{action:'scene.image',instruction:'',baseAssetId:'plan'}},
    {name:'image plan',intent:{action:'storyboard.create',instruction:'Explain the paper'}},
    {name:'video plan revision',intent:{action:'storyboard.revise',instruction:'Fix this plan',baseAssetId:'plan'}},
    {name:'video',intent:{action:'video.create',instruction:'',baseAssetId:'plan'}},
    {name:'unknown video',unknown:'video.create',intent:{action:'storyboard.create',instruction:'Changed'}},
    {name:'unknown video plan revision',unknown:'storyboard.revise',intent:{action:'storyboard.create',instruction:'Changed'}},
  ] satisfies Array<{name:string;intent:Props['intent'];unknown?:'video.create' | 'storyboard.revise'}>)('blocks $name when fresh identity differs from the still-old prop without touching keys or unknown records', async ({intent,...entry}) => {
    const unknownAction='unknown' in entry ? entry.unknown : undefined;
    const saved=unknownAction ? unknownSubmission(unknownAction) : undefined;
    const records=saved?.records ?? new Map<string,SubmissionIntent>();const key=vi.spyOn(crypto,'randomUUID');
    api.getCurrentUser.mockResolvedValue({userId:'actor-b'});
    const host=mount(intent,true,{submissionRecords:records});await host.flush();await host.confirm();await host.flush();
    expect(api.getCurrentUser).toHaveBeenCalledWith({fresh:true});
    expect(api.generatePresentationSceneImage).not.toHaveBeenCalled();expect(api.generatePresentationStoryboard).not.toHaveBeenCalled();expect(api.generatePresentationVideo).not.toHaveBeenCalled();
    expect(key).not.toHaveBeenCalled();expect(records.size).toBe(saved ? 1 : 0);
    expect(find(host.tree(),element => element.props.role==='alert').props.children).toBe('identityChanged');expect(host.confirmation()?.ready).toBe(false);
    if (saved) {
      expect(saved.record.isUncertain).toBe(true);expect(saved.record.isBusy).toBe(false);
      expect(saved.record.request).toEqual({action:unknownAction,sourceIds:saved.sourceIds,payload:saved.payload});
      expect(api.getHermesVideoCapability).not.toHaveBeenCalled();
    }
  });

  it('cannot confirm without an actor even with a writable workspace and valid sources available', async () => {
    const records=new Map<string,SubmissionIntent>();const key=vi.spyOn(crypto,'randomUUID');
    const host=mount({action:'video.create',instruction:'',baseAssetId:'plan'},true,{userId:undefined,submissionRecords:records});await host.flush();
    expect(host.confirmation()?.ready).toBe(false);await host.confirmation()!.confirm();
    expect(api.getCurrentUser).not.toHaveBeenCalled();expect(api.getHermesVideoCapability).not.toHaveBeenCalled();expect(api.generatePresentationVideo).not.toHaveBeenCalled();
    expect(key).not.toHaveBeenCalled();expect(records.size).toBe(0);
  });

  it('does not classify a failed fresh identity read as an uncertain paid submission', async () => {
    api.getCurrentUser.mockRejectedValue(new Error('Identity GET disconnected'));
    const records=new Map<string,SubmissionIntent>();const key=vi.spyOn(crypto,'randomUUID');
    const host=mount({action:'scene.image',instruction:'',baseAssetId:'plan'},true,{submissionRecords:records});await host.flush();await host.confirm();await host.flush();
    expect(find(host.tree(),element => element.props.role==='alert').props.children).toBe('identityChanged');expect(host.confirmation()?.ready).toBe(false);
    expect(api.generatePresentationSceneImage).not.toHaveBeenCalled();expect(key).not.toHaveBeenCalled();expect(records.size).toBe(0);
  });

  it('keeps the synchronous duplicate guard while fresh identity is pending and drops it on an actor switch', async () => {
    const identity=deferred<{userId:string}>();api.getCurrentUser.mockReturnValueOnce(identity.promise);
    const records=new Map<string,SubmissionIntent>();const key=vi.spyOn(crypto,'randomUUID');
    const host=mount({action:'scene.image',instruction:'',baseAssetId:'plan'},true,{submissionRecords:records});await host.flush();
    const confirm=host.confirmation()!.confirm;const pending=confirm();await confirm();await host.flush();
    expect(api.getCurrentUser).toHaveBeenCalledTimes(1);expect(host.confirmation()?.ready).toBe(false);
    host.update({userId:'actor-b'});await host.flush();identity.resolve({userId:'actor-a'});await pending;await host.flush();
    expect(api.generatePresentationSceneImage).not.toHaveBeenCalled();expect(key).not.toHaveBeenCalled();expect(records.size).toBe(0);
  });
});
