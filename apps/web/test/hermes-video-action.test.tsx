import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getResearchObject:vi.fn(),listVersions:vi.fn(),listMyWorkspaces:vi.fn(),listVersionClaims:vi.fn(),listPresentationAssets:vi.fn(),
  generatePresentationSceneImage:vi.fn(),generatePresentationStoryboard:vi.fn(),generatePresentationVideo:vi.fn(),ApiClientError:class extends Error { status=0; } }));
const copy = vi.hoisted(() => Object.assign((key:string) => key,{has:() => false}));
vi.mock('@/lib/api', () => api);
vi.mock('next-intl', () => ({useLocale:() => 'en',useTranslations:() => copy}));
vi.mock('@/components/research/useVersionLabels', () => ({useVersionLabels:() => ({label:() => 'Private draft'})}));
vi.mock('@/lib/hermes/draft-state', () => ({getHermesDraftStorage:() => null,loadHermesPresentationDraft:() => null,saveHermesPresentationDraft:vi.fn()}));
vi.mock('react', async original => ({...await original<typeof React>(),useState:vi.fn(),useRef:vi.fn(),useEffect:vi.fn()}));
import { HermesPresentationAction } from '../components/hermes/HermesPresentationAction';
import type { HermesConversationAction } from '../lib/hermes/conversation-action';

type EventProps = { children?:React.ReactNode; onChange?:(event:{target:{value:string}}) => void; onClick?:() => void; onSubmit?:(event:{preventDefault():void}) => Promise<void> };
function find(node:React.ReactNode, match:(element:React.ReactElement<EventProps>) => boolean):React.ReactElement<EventProps> {
  if (React.isValidElement<EventProps>(node)) {
    if (match(node)) return node;
    for (const child of React.Children.toArray(node.props.children)) { try { return find(child,match); } catch { /* next sibling */ } }
  }
  throw new Error('Control missing');
}

// Run the actual component's effects and event handlers in the existing Node
// hook-host style. This proves request/state behavior, not browser rendering.
function mount(intent:Parameters<typeof HermesPresentationAction>[0]['intent'], conversation=false) {
  const states:unknown[]=[]; const refs:Array<{current:unknown}>=[];
  const previousDeps:Array<React.DependencyList | undefined>=[];
  const jobs:Array<() => void>=[];
  let stateIndex=0,refIndex=0,effectIndex=0,dirty=true;
  let tree:React.ReactNode;
  let action:HermesConversationAction | null=null;
  const props={researchObjectId:'paper',requestedVersionId:'version',intent,onBack:vi.fn(),onSubmitted:vi.fn(),
    onConfirmationChange:conversation ? (next:HermesConversationAction | null) => {action=next;} : undefined};
  vi.mocked(React.useState).mockImplementation((<T,>(initial:T | (() => T)) => {
    const index=stateIndex++;
    if (!(index in states)) states[index]=typeof initial === 'function' ? (initial as () => T)() : initial;
    return [states[index],(next:T | ((old:T) => T)) => { const value=typeof next === 'function' ? (next as (old:T) => T)(states[index] as T) : next; if (!Object.is(value,states[index])) {states[index]=value;dirty=true;} }];
  }) as typeof React.useState);
  vi.mocked(React.useRef).mockImplementation((<T,>(initial:T) => refs[refIndex++] ??= {current:initial}) as typeof React.useRef);
  vi.mocked(React.useEffect).mockImplementation((effect,deps) => {
    const index=effectIndex++; const previous=previousDeps[index];
    if (previous && deps && previous.length===deps.length && deps.every((value,i) => Object.is(value,previous[i]))) return;
    previousDeps[index]=deps; jobs.push(() => {effect();});
  });
  return {
    tree:() => tree,
    async confirm() { if (!action?.ready) throw new Error('Conversation action is not ready'); await action.confirm(); },
    async flush() {
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
  vi.clearAllMocks();
  api.getResearchObject.mockResolvedValue({researchObject:{workspaceId:'workspace',title:'Paper'}});
  api.listVersions.mockResolvedValue({versions:[{versionId:'version',status:'draft'}]});
  api.listMyWorkspaces.mockResolvedValue([{id:'workspace',status:'active',role:'author'}]);
  api.listVersionClaims.mockResolvedValue({claims:[{id:'claim',researchObjectId:'paper',versionId:'version',extractionStatus:'succeeded',updatedAt:'2026-10-08'}]});
  api.listPresentationAssets.mockResolvedValue({assets:[{id:'plan',researchObjectId:'paper',versionId:'version',kind:'interactive_html',status:'draft',updatedAt:'2026-10-08',sourceClaimIds:['claim'],
    canGenerateVideo:true,canGenerateSceneImage:true,videoFrameAssetIds:['f2','f1','f3'],storyboard:{output:'video',narrative:true,document:{scenes:[{title:'First'},{title:'Second'},{title:'Third'}]}}}]});
  for (const generate of [api.generatePresentationSceneImage,api.generatePresentationStoryboard,api.generatePresentationVideo]) generate.mockResolvedValue({task:{id:'task'}});
});

describe('native video controls', () => {
  it('keeps an image scene intent eligible without treating it as a video revision scope', async () => {
    const host=mount({action:'scene.image',instruction:'',sceneIndex:1}); await host.flush();
    await find(host.tree(),element => element.type==='form').props.onSubmit!({preventDefault(){}});
    expect(api.generatePresentationSceneImage).toHaveBeenCalledWith('paper','version',['claim'],{storyboardAssetId:'plan',sceneIndex:1},expect.any(String),expect.any(AbortSignal));
    expect(api.generatePresentationStoryboard).not.toHaveBeenCalled();
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
    expect(api.generatePresentationVideo).toHaveBeenCalledWith('paper','version',['claim'],{profile:'content-driven-v1',storyboardAssetId:'plan',sceneImageAssetIds:['f2','f1','f3']},expect.any(String),expect.any(AbortSignal));
  });
});
