import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HermesResearchRunPanel } from '../components/hermes/HermesResearchRunPanel';
import { loadPendingHermesRunStart, savePendingHermesRunStart } from '../lib/hermes/draft-state';
import type { HermesResearchRun } from '../lib/api';

const api=vi.hoisted(() => ({ApiClientError:class extends Error {status=0;},getCurrentUser:vi.fn(),getAgentTask:vi.fn(),getExistingHermesResearchRun:vi.fn(),getHermesResearchRun:vi.fn(),createHermesResearchRun:vi.fn(),authorizeHermesGenerationGrant:vi.fn(),retryHermesGeneration:vi.fn(),SESSION_CHANGED_EVENT:'session-changed',SESSION_INVALIDATED_EVENT:'session-invalidated',presentationAssetContentUrl:(ro:string,version:string,id:string) => `/media/${ro}/${version}/${id}`}));
const copy=vi.hoisted(() => (key:string,values?:{source?:string}) => values?.source && key.endsWith('startFor') ? `${key}:${values.source}` : key);
vi.mock('@/lib/api',() => api);
vi.mock('next-intl',() => ({useLocale:() => 'en',useTranslations:() => copy}));
vi.mock('@/lib/hermes/start-paper-narrative',async original => ({...await original<typeof import('../lib/hermes/start-paper-narrative')>(),prepareHermesNarrativeSource:vi.fn(async ({scope,pending}) => ({scope,pending}))}));
vi.mock('react',async original => ({...await original<typeof React>(),useState:vi.fn(),useRef:vi.fn(),useEffect:vi.fn(),useMemo:vi.fn(),useCallback:vi.fn()}));

const ro='c896802c-35dd-4b59-8db1-5f374f83a6d8';
const source='d98862b0-0cf3-47a6-872f-1842a9308e7e';
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
  return {storage,onRunCreated,tree:() => tree,async flush() {
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
  vi.clearAllMocks();
  api.getCurrentUser.mockResolvedValue({userId:'user'});
  api.getAgentTask.mockResolvedValue({task:{id:'guide',researchObjectId:ro,kind:'workspace.guide',status:'succeeded',result:{researchRunDraft:{researchObjectId:ro,ingestionTaskId:source,locale:generation.locale,style:generation.style,instruction:generation.instruction,output:'video'},needsMoreInformation:false,nextSteps:[]}}});
  api.getExistingHermesResearchRun.mockResolvedValue({run:null});
  api.getHermesResearchRun.mockResolvedValue({run:videoRun});
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
    expect(api.createHermesResearchRun).toHaveBeenCalledWith(ro,[source],`hermes-guide-run:user:guide:${source}:video`,generation);
    expect(host.onRunCreated).toHaveBeenCalledWith(videoRun);
  });
  it('shows and replays the original unknown video intent without replacing an image request',async () => {
    const host=mount();
    const image={key:'old-image',generation:{...generation,output:undefined},savedAt:1};
    const pending={key:'unknown-video',generation:{...generation,style:'ink',instruction:'The original video request'},savedAt:2};
    savePendingHermesRunStart(host.storage,imageScope,image);savePendingHermesRunStart(host.storage,videoScope,pending);
    await host.flush();
    expect(find(host.tree(),element => element.type==='p' && element.props.children===pending.generation.instruction)).toBeTruthy();
    find(host.tree(),element => element.type==='button' && element.props.children==='narrative.resumePending').props.onClick!();await host.flush();
    expect(api.createHermesResearchRun).toHaveBeenCalledWith(ro,[source],pending.key,pending.generation);
    expect(loadPendingHermesRunStart(host.storage,imageScope)).toEqual({...image,generation:{...generation,output:undefined}});
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
  });
});
