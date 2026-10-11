import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HermesResearchRunPanel } from '../components/hermes/HermesResearchRunPanel';
import { loadPendingHermesRunStart, savePendingHermesRunStart } from '../lib/hermes/draft-state';
import { prepareHermesNarrativeSource } from '../lib/hermes/start-paper-narrative';
import type { HermesResearchRun } from '../lib/api';

const api=vi.hoisted(() => ({ApiClientError:class extends Error {constructor(public code:string,message=code,public status=0) {super(message);}},getCurrentUser:vi.fn(),getAgentTask:vi.fn(),getExistingHermesResearchRun:vi.fn(),getHermesResearchRun:vi.fn(),getHermesVideoCapability:vi.fn(),getIngestionTask:vi.fn(),isConfirmedIngestionReanalysisSource:vi.fn(),reanalyzeConfirmedIngestion:vi.fn(),createHermesResearchRun:vi.fn(),authorizeHermesGenerationGrant:vi.fn(),retryHermesGeneration:vi.fn(),SESSION_CHANGED_EVENT:'session-changed',SESSION_INVALIDATED_EVENT:'session-invalidated',presentationAssetContentUrl:(ro:string,version:string,id:string) => `/media/${ro}/${version}/${id}`}));
const realNarrative=vi.hoisted(() => ({prepare:null as typeof import('../lib/hermes/start-paper-narrative')['prepareHermesNarrativeSource'] | null}));
const copy=vi.hoisted(() => (key:string,values?:{source?:string}) => values?.source && key.endsWith('startFor') ? `${key}:${values.source}` : key);
vi.mock('@/lib/api',() => api);
vi.mock('next-intl',() => ({useLocale:() => 'en',useTranslations:() => copy}));
vi.mock('@/lib/hermes/start-paper-narrative',async original => {const actual=await original<typeof import('../lib/hermes/start-paper-narrative')>();realNarrative.prepare=actual.prepareHermesNarrativeSource;return {...actual,prepareHermesNarrativeSource:vi.fn(async ({scope,pending}) => ({scope,pending}))};});
vi.mock('react',async original => ({...await original<typeof React>(),useState:vi.fn(),useRef:vi.fn(),useEffect:vi.fn(),useMemo:vi.fn(),useCallback:vi.fn()}));

const ro='c896802c-35dd-4b59-8db1-5f374f83a6d8';
const source='d98862b0-0cf3-47a6-872f-1842a9308e7e';
const nextSource='00000000-0000-4000-8000-000000000712';
const imageScope={userId:'user',researchObjectId:ro,ingestionTaskId:source};
const videoScope={...imageScope,output:'video' as const};
const generation={profile:'visual-narrative-v1' as const,maxAgentTasks:9 as const,locale:'en' as const,style:'auto',instruction:'Make a narrated paper video',output:'video' as const};
const videoRun={id:'video-run',actorId:'user',researchObjectId:ro,profile:'visual-narrative-v1',versionId:'video-version',status:'running',generationSettings:generation,steps:[{id:'source-step',stage:'source_ingestion',ingestionTaskId:source,status:'succeeded',ordinal:0}]} as HermesResearchRun;
type ControlProps={children?:React.ReactNode;onClick?:() => void;src?:string;href?:string;disabled?:boolean};
function find(node:React.ReactNode,match:(element:React.ReactElement<ControlProps>) => boolean):React.ReactElement<ControlProps> {
  if (React.isValidElement<ControlProps>(node)) {
    if (match(node)) return node;
    for (const child of React.Children.toArray(node.props.children)) {try {return find(child,match);} catch { /* next sibling */ }}
  }
  throw new Error('Control missing');
}

// Exercise the real effects and click handlers with mocked API responses.
// This is request/recovery evidence, not browser or aesthetic acceptance.
function mount(options:{runId?:string;storage?:Storage}={}) {
  const values=new Map<string,string>();
  const storage=options.storage ?? {getItem:(key:string) => values.get(key) ?? null,setItem:(key:string,value:string) => {values.set(key,value);},removeItem:(key:string) => {values.delete(key);}} as Storage;
  const events=new EventTarget();
  vi.stubGlobal('window',{sessionStorage:storage,addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),setTimeout:vi.fn(() => 0),clearTimeout:vi.fn()});
  const states:unknown[]=[]; const refs:Array<{current:unknown}>=[];
  const effects:Array<{deps?:React.DependencyList;cleanup?:() => void}>=[];
  const memos:Array<{deps?:React.DependencyList;value:unknown}>=[]; const jobs:Array<() => void>=[];
  let stateIndex=0,refIndex=0,effectIndex=0,memoIndex=0,dirty=true;
  let tree:React.ReactNode;
  const equal=(left?:React.DependencyList,right?:React.DependencyList) => Boolean(left && right && left.length===right.length && left.every((value,index) => Object.is(value,right[index])));
  vi.mocked(React.useState).mockImplementation((<T,>(initial:T | (() => T)) => {
    const index=stateIndex++;
    if (!(index in states)) states[index]=typeof initial==='function' ? (initial as () => T)() : initial;
    return [states[index],(next:T | ((old:T) => T)) => {const value=typeof next==='function' ? (next as (old:T) => T)(states[index] as T) : next;if (!Object.is(value,states[index])) {states[index]=value;dirty=true;}}];
  }) as typeof React.useState);
  vi.mocked(React.useRef).mockImplementation((<T,>(initial:T) => refs[refIndex++] ??= {current:initial}) as typeof React.useRef);
  vi.mocked(React.useEffect).mockImplementation((effect,deps) => {
    const index=effectIndex++; const previous=effects[index];
    if (previous && equal(previous.deps,deps)) return;
    jobs.push(() => {previous?.cleanup?.(); const cleanup=effect();effects[index]={deps,cleanup:typeof cleanup==='function' ? cleanup : undefined};});
  });
  const memo=<T,>(create:() => T,deps?:React.DependencyList):T => {
    const index=memoIndex++; const previous=memos[index];
    if (previous && equal(previous.deps,deps)) return previous.value as T;
    const value=create();memos[index]={deps,value};return value;
  };
  vi.mocked(React.useMemo).mockImplementation(memo);
  vi.mocked(React.useCallback).mockImplementation(((fn:(...args:never[]) => unknown,deps:React.DependencyList) => memo(() => fn,deps)) as typeof React.useCallback);
  const onRunCreated=vi.fn();
  const props={researchObjectId:ro,tasks:[{id:source,researchObjectId:ro,researchTitle:'Paper',logicalPath:'paper.pdf',state:'needs_review' as const,retryCount:0,error:null}],runId:options.runId ?? '',guideTaskId:options.runId ? '' : 'guide',onRunCreated};
  return {storage,onRunCreated,tree:() => tree,
    changeSource(nextSource:string) { props.tasks=[{...props.tasks[0],id:nextSource}]; props.guideTaskId='next-guide'; dirty=true; },
    changeAccount() { events.dispatchEvent(new Event(api.SESSION_CHANGED_EVENT)); },
    async flush() {
    let idle=0;
    for (let pass=0;pass<24;pass++) {
      if (dirty) {dirty=false;stateIndex=0;refIndex=0;effectIndex=0;memoIndex=0;tree=HermesResearchRunPanel(props);}
      for (const job of jobs.splice(0)) job();
      for (let turn=0;turn<6;turn++) await Promise.resolve();
      idle=!dirty && !jobs.length ? idle+1 : 0;if (idle===3) return;
    }
    throw new Error('Component did not settle');
  }};
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prepareHermesNarrativeSource).mockImplementation(async ({scope,pending}) => ({scope,pending}));
  api.getCurrentUser.mockResolvedValue({userId:'user'});
  api.getAgentTask.mockResolvedValue({task:{id:'guide',researchObjectId:ro,kind:'workspace.guide',status:'succeeded',result:{researchRunDraft:{researchObjectId:ro,ingestionTaskId:source,locale:generation.locale,style:generation.style,instruction:generation.instruction,output:'video'},needsMoreInformation:false,nextSteps:[]}}});
  api.getExistingHermesResearchRun.mockResolvedValue({run:null});
  api.getHermesResearchRun.mockResolvedValue({run:videoRun});
  api.getHermesVideoCapability.mockResolvedValue({canGenerateVideo:true});
  api.getIngestionTask.mockResolvedValue({researchObjectId:ro,version:1,task:{id:source,artifactId:'artifact',agentTaskId:'source-agent',state:'confirmed',result:{canonicalExtractionContract:'grounded-passages-v2',sourceMapAvailable:true}}});
  api.isConfirmedIngestionReanalysisSource.mockReturnValue(true);
  api.reanalyzeConfirmedIngestion.mockResolvedValue({id:nextSource,artifactId:'artifact',state:'queued'});
  api.createHermesResearchRun.mockResolvedValue({run:videoRun});
});
afterEach(() => {vi.unstubAllGlobals();});

describe('ordinary video workflow from the existing guide',() => {
  it('reads the selected video source and starts only after the visible action',async () => {
    const host=mount();await host.flush();
    expect(api.createHermesResearchRun).not.toHaveBeenCalled();
    expect(api.getExistingHermesResearchRun).toHaveBeenCalledWith(ro,source,expect.any(AbortSignal),'video');
    const button=find(host.tree(),element => element.type==='button' && element.props.children==='video.startFor:paper.pdf');
    expect(button.props.disabled).toBe(false);button.props.onClick!();await host.flush();
    expect(api.getHermesVideoCapability).toHaveBeenCalledWith(ro,expect.any(AbortSignal));
    expect(api.getHermesVideoCapability.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(prepareHermesNarrativeSource).mock.invocationCallOrder[0]);
    expect(api.createHermesResearchRun).toHaveBeenCalledWith(ro,[source],`hermes-guide-run:user:guide:${source}:video`,generation);
    expect(host.onRunCreated).toHaveBeenCalledWith(videoRun);
  });
  it('shows and replays the original unknown video intent without replacing an image request',async () => {
    api.getHermesVideoCapability.mockResolvedValue({canGenerateVideo:false});
    const host=mount();
    const image={key:'old-image',generation:{...generation,output:undefined},savedAt:1};
    const pending={key:'unknown-video',generation:{...generation,style:'ink',instruction:'The original video request'},savedAt:2};
    savePendingHermesRunStart(host.storage,imageScope,image);savePendingHermesRunStart(host.storage,videoScope,pending);
    await host.flush();
    expect(find(host.tree(),element => element.type==='p' && element.props.children===pending.generation.instruction)).toBeTruthy();
    find(host.tree(),element => element.type==='button' && element.props.children==='narrative.resumePending').props.onClick!();await host.flush();
    expect(api.createHermesResearchRun).not.toHaveBeenCalled();
    expect(loadPendingHermesRunStart(host.storage,videoScope)).toEqual(pending);
    api.getHermesVideoCapability.mockResolvedValue({canGenerateVideo:true});
    find(host.tree(),element => element.type==='button' && element.props.children==='narrative.resumePending').props.onClick!();await host.flush();
    expect(api.createHermesResearchRun).toHaveBeenCalledWith(ro,[source],pending.key,pending.generation);
    expect(api.getHermesVideoCapability).toHaveBeenCalledTimes(2);
    expect(loadPendingHermesRunStart(host.storage,imageScope)).toEqual({...image,generation:{...generation,output:undefined}});
  });
  it('blocks an unavailable new video before source preparation or saving a new intent, then checks again on retry',async () => {
    api.getHermesVideoCapability.mockResolvedValue({canGenerateVideo:false});
    const host=mount();await host.flush();
    find(host.tree(),element => element.type==='button' && element.props.children==='video.startFor:paper.pdf').props.onClick!();await host.flush();
    expect(find(host.tree(),element => element.props.children==='video.unavailable')).toBeTruthy();
    expect(prepareHermesNarrativeSource).not.toHaveBeenCalled();
    expect(api.createHermesResearchRun).not.toHaveBeenCalled();
    expect(loadPendingHermesRunStart(host.storage,videoScope)).toBeNull();
    api.getHermesVideoCapability.mockResolvedValue({canGenerateVideo:true});
    find(host.tree(),element => element.type==='button' && element.props.children==='video.startFor:paper.pdf').props.onClick!();await host.flush();
    expect(api.getHermesVideoCapability).toHaveBeenCalledTimes(3);
    expect(prepareHermesNarrativeSource).toHaveBeenCalledTimes(1);
    expect(api.createHermesResearchRun).toHaveBeenCalledTimes(1);
  });
  it('leaves no pending or paid request when the capability read fails',async () => {
    api.getHermesVideoCapability.mockRejectedValue(new Error('Read unavailable'));
    const host=mount();await host.flush();
    find(host.tree(),element => element.type==='button' && element.props.children==='video.startFor:paper.pdf').props.onClick!();await host.flush();
    expect(find(host.tree(),element => element.props.children==='Read unavailable')).toBeTruthy();
    expect(prepareHermesNarrativeSource).not.toHaveBeenCalled();
    expect(api.createHermesResearchRun).not.toHaveBeenCalled();
    expect(loadPendingHermesRunStart(host.storage,videoScope)).toBeNull();
  });
  for (const contextChange of ['source','account'] as const) {
    it(`ignores a stale availability result after the ${contextChange} changes`,async () => {
      let release!:(value:{canGenerateVideo:boolean}) => void;
      api.getHermesVideoCapability.mockImplementation(() => new Promise(resolve => {release=resolve;}));
      const host=mount();await host.flush();
      find(host.tree(),element => element.type==='button' && element.props.children==='video.startFor:paper.pdf').props.onClick!();await host.flush();
      expect(api.getHermesVideoCapability).toHaveBeenCalledTimes(1);
      if (contextChange==='source') {
        api.getAgentTask.mockResolvedValue({task:{id:'next-guide',researchObjectId:ro,kind:'workspace.guide',status:'succeeded',result:{researchRunDraft:{researchObjectId:ro,ingestionTaskId:nextSource,locale:'en',style:'auto',instruction:'New video',output:'video'},needsMoreInformation:false,nextSteps:[]}}});
        host.changeSource(nextSource);
      } else {api.getCurrentUser.mockResolvedValue({userId:'another-user'});host.changeAccount();}
      await host.flush();release({canGenerateVideo:true});await host.flush();
      expect(prepareHermesNarrativeSource).not.toHaveBeenCalled();
      expect(api.createHermesResearchRun).not.toHaveBeenCalled();
      expect(loadPendingHermesRunStart(host.storage,videoScope)).toBeNull();
    });
  }
  it('releases the old read on a source switch so a new source can start before the old response settles',async () => {
    let release!:(value:{canGenerateVideo:boolean}) => void;
    api.getHermesVideoCapability.mockImplementationOnce(() => new Promise(resolve => {release=resolve;}));
    const host=mount();await host.flush();
    find(host.tree(),element => element.type==='button' && element.props.children==='video.startFor:paper.pdf').props.onClick!();await host.flush();
    const oldSignal=api.getHermesVideoCapability.mock.calls[0][1] as AbortSignal;
    api.getAgentTask.mockResolvedValue({task:{id:'next-guide',researchObjectId:ro,kind:'workspace.guide',status:'succeeded',result:{researchRunDraft:{researchObjectId:ro,ingestionTaskId:nextSource,locale:'en',style:'auto',instruction:'New video',output:'video'},needsMoreInformation:false,nextSteps:[]}}});
    api.createHermesResearchRun.mockResolvedValue({run:{...videoRun,steps:[{id:'next-source-step',stage:'source_ingestion',ingestionTaskId:nextSource,status:'succeeded',ordinal:0}]}});
    host.changeSource(nextSource);await host.flush();
    expect(oldSignal.aborted).toBe(true);
    find(host.tree(),element => element.type==='button' && element.props.children==='video.startFor:paper.pdf').props.onClick!();await host.flush();
    expect(api.getHermesVideoCapability).toHaveBeenCalledTimes(3);
    expect(api.createHermesResearchRun).toHaveBeenCalledTimes(1);
    expect(api.createHermesResearchRun.mock.calls[0][1]).toEqual([nextSource]);
    release({canGenerateVideo:true});await host.flush();
    expect(api.createHermesResearchRun).toHaveBeenCalledTimes(1);
  });
  it('rechecks admission after a definite mutation refusal without losing the original pending key',async () => {
    api.createHermesResearchRun.mockRejectedValueOnce(Object.assign(new api.ApiClientError('Service closed'),{code:'VIDEO_UNAVAILABLE',status:503}));
    const host=mount();await host.flush();
    find(host.tree(),element => element.type==='button' && element.props.children==='video.startFor:paper.pdf').props.onClick!();await host.flush();
    const pending=loadPendingHermesRunStart(host.storage,videoScope);
    expect(pending?.key).toBe(`hermes-guide-run:user:guide:${source}:video`);
    expect(find(host.tree(),element => element.props.children==='video.unavailable')).toBeTruthy();
    api.getHermesVideoCapability.mockResolvedValue({canGenerateVideo:false});
    find(host.tree(),element => element.type==='button' && element.props.children==='narrative.resumePending').props.onClick!();await host.flush();
    expect(api.getHermesVideoCapability).toHaveBeenCalledTimes(3);
    expect(api.createHermesResearchRun).toHaveBeenCalledTimes(1);
    expect(loadPendingHermesRunStart(host.storage,videoScope)).toEqual(pending);
  });
  it('opens an existing run for the prepared source while new generation is unavailable',async () => {
    api.getHermesVideoCapability.mockResolvedValue({canGenerateVideo:false});
    const preparedRun={...videoRun,steps:[{id:'next-source-step',stage:'source_ingestion',ingestionTaskId:nextSource,status:'succeeded',ordinal:0}]} as HermesResearchRun;
    api.getExistingHermesResearchRun.mockImplementation(async (_ro:string,ingestion:string) => ({run:ingestion===nextSource ? preparedRun : null}));
    vi.mocked(prepareHermesNarrativeSource).mockImplementation(async ({scope,pending}) => ({scope:{...scope,ingestionTaskId:nextSource},pending}));
    const host=mount();
    savePendingHermesRunStart(host.storage,videoScope,{key:'original-key',generation,savedAt:1,sourceReanalysisKey:'original-source-key'});
    await host.flush();
    find(host.tree(),element => element.type==='button' && element.props.children==='narrative.resumePending').props.onClick!();await host.flush();
    expect(api.getExistingHermesResearchRun).toHaveBeenCalledWith(ro,nextSource,expect.any(AbortSignal),'video');
    expect(host.onRunCreated).toHaveBeenCalledWith(preparedRun);
    expect(api.getHermesVideoCapability).not.toHaveBeenCalled();
    expect(api.createHermesResearchRun).not.toHaveBeenCalled();
  });
  it('keeps both source receipts and the prepared run intent when availability closes after source preparation',async () => {
    api.getHermesVideoCapability.mockResolvedValueOnce({canGenerateVideo:true}).mockResolvedValue({canGenerateVideo:false});
    vi.mocked(prepareHermesNarrativeSource).mockImplementation(async ({scope,pending,storage}) => {
      const saved={...pending,sourceReanalysisKey:pending.sourceReanalysisKey ?? 'paid-source-key'};
      const preparedScope={...scope,ingestionTaskId:nextSource};
      savePendingHermesRunStart(storage,scope,saved);savePendingHermesRunStart(storage,preparedScope,saved);
      return {scope:preparedScope,pending:saved};
    });
    const host=mount();await host.flush();
    find(host.tree(),element => element.type==='button' && element.props.children==='video.startFor:paper.pdf').props.onClick!();await host.flush();
    const original=loadPendingHermesRunStart(host.storage,videoScope);
    const prepared=loadPendingHermesRunStart(host.storage,{...videoScope,ingestionTaskId:nextSource});
    expect(original?.sourceReanalysisKey).toBe('paid-source-key');expect(prepared).toEqual(original);
    expect(api.getExistingHermesResearchRun).toHaveBeenCalledWith(ro,nextSource,expect.any(AbortSignal),'video');
    expect(api.createHermesResearchRun).not.toHaveBeenCalled();
    find(host.tree(),element => element.type==='button' && element.props.children==='narrative.resumePending').props.onClick!();await host.flush();
    expect(loadPendingHermesRunStart(host.storage,videoScope)).toEqual(original);
    expect(loadPendingHermesRunStart(host.storage,{...videoScope,ingestionTaskId:nextSource})).toEqual(prepared);
    expect(api.createHermesResearchRun).not.toHaveBeenCalled();
  });
  it('rejects a foreign run returned for the prepared source without creating a replacement',async () => {
    vi.mocked(prepareHermesNarrativeSource).mockImplementation(async ({scope,pending}) => ({scope:{...scope,ingestionTaskId:nextSource},pending}));
    api.getExistingHermesResearchRun.mockImplementation(async (_ro:string,ingestion:string) => ({run:ingestion===nextSource ? {...videoRun,actorId:'foreign',steps:[{id:'next-source-step',stage:'source_ingestion',ingestionTaskId:nextSource,status:'succeeded',ordinal:0}]} : null}));
    const host=mount();await host.flush();
    find(host.tree(),element => element.type==='button' && element.props.children==='video.startFor:paper.pdf').props.onClick!();await host.flush();
    expect(find(host.tree(),element => element.props.children==='narrative.identityChanged')).toBeTruthy();
    expect(host.onRunCreated).not.toHaveBeenCalled();expect(api.createHermesResearchRun).not.toHaveBeenCalled();
  });
  it('starts a fresh source phase through the real helper and creates the video for its prepared source',async () => {
    vi.mocked(prepareHermesNarrativeSource).mockImplementation(realNarrative.prepare!);
    api.createHermesResearchRun.mockResolvedValue({run:{...videoRun,steps:[{id:'next-source-step',stage:'source_ingestion',ingestionTaskId:nextSource,status:'succeeded',ordinal:0}]}});
    const host=mount();await host.flush();
    find(host.tree(),element => element.type==='button' && element.props.children==='video.startFor:paper.pdf').props.onClick!();await host.flush();
    expect(api.reanalyzeConfirmedIngestion).toHaveBeenCalledWith(source,'source-agent',expect.any(String),undefined,'video');
    expect(api.getHermesVideoCapability.mock.invocationCallOrder[0]).toBeLessThan(api.reanalyzeConfirmedIngestion.mock.invocationCallOrder[0]);
    expect(api.createHermesResearchRun).toHaveBeenCalledWith(ro,[nextSource],`hermes-guide-run:user:guide:${source}:video`,generation);
    expect(loadPendingHermesRunStart(host.storage,videoScope)).toMatchObject({phase:'source',sourceReanalysisOutput:'video'});
    expect(loadPendingHermesRunStart(host.storage,{...videoScope,ingestionTaskId:nextSource})).toMatchObject({phase:'run',runId:'video-run'});
  });
  it('holds a legacy source key through the real helper while video is unavailable without changing its original body',async () => {
    vi.mocked(prepareHermesNarrativeSource).mockImplementation(realNarrative.prepare!);
    api.getHermesVideoCapability.mockResolvedValue({canGenerateVideo:false});
    const host=mount();const pending={key:'legacy-run-key',sourceReanalysisKey:'legacy-source-key',generation,savedAt:1};
    savePendingHermesRunStart(host.storage,videoScope,pending);await host.flush();
    find(host.tree(),element => element.type==='button' && element.props.children==='narrative.resumePending').props.onClick!();await host.flush();
    expect(api.getHermesVideoCapability).toHaveBeenCalled();expect(api.reanalyzeConfirmedIngestion).not.toHaveBeenCalled();expect(api.createHermesResearchRun).not.toHaveBeenCalled();
    expect(loadPendingHermesRunStart(host.storage,videoScope)).toEqual(pending);
    expect(find(host.tree(),element => element.props.children==='video.unavailable')).toBeTruthy();
  });
  it('does not reopen a mismatched image response or send a replacement',async () => {
    api.getExistingHermesResearchRun.mockResolvedValue({run:{...videoRun,generationSettings:{...generation,output:undefined}}});
    const host=mount();await host.flush();
    expect(host.onRunCreated).not.toHaveBeenCalled();expect(api.createHermesResearchRun).not.toHaveBeenCalled();
    expect(find(host.tree(),element => element.props.children==='narrative.identityChanged')).toBeTruthy();
  });
  it('clears only a loaded video request and previews the final asset in its exact version',async () => {
    api.getHermesResearchRun.mockResolvedValue({run:{...videoRun,status:'awaiting_video_review',steps:[...videoRun.steps,{id:'video-step',stage:'video',status:'awaiting_approval',ordinal:0,availableAssetId:'final-video',availableAssetStatus:'draft'}]}});
    const host=mount({runId:'video-run'});
    savePendingHermesRunStart(host.storage,imageScope,{key:'image',generation:{...generation,output:undefined},savedAt:1,runId:'image-run'});
    savePendingHermesRunStart(host.storage,videoScope,{key:'video',generation,savedAt:2,runId:'video-run'});
    await host.flush();
    expect(loadPendingHermesRunStart(host.storage,videoScope)).toBeNull();
    expect(loadPendingHermesRunStart(host.storage,imageScope)?.key).toBe('image');
    expect(find(host.tree(),element => element.type==='video').props.src).toBe(`/media/${ro}/video-version/final-video`);
    expect(find(host.tree(),element => element.props.children==='video.viewResult').props.href).toBe(`/research-objects/${ro}/presentation?version=video-version`);
    expect(api.createHermesResearchRun).not.toHaveBeenCalled();
    expect(api.getHermesVideoCapability).not.toHaveBeenCalled();
  });
});
