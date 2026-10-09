import * as React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionProvider, type useSession } from '@/components/auth/SessionProvider';
import { useHermesViewerId } from '@/components/hermes/useHermesViewerId';

const api=vi.hoisted(() => ({ApiClientError:class extends Error {status=0;},getCurrentUser:vi.fn(),invalidateSessionClientCache:vi.fn(),SESSION_CHANGED_EVENT:'session-changed',SESSION_INVALIDATED_EVENT:'session-invalidated'}));
vi.mock('@/lib/api',() => api);
vi.mock('react',async original => ({...await original<typeof React>(),useState:vi.fn(),useRef:vi.fn(),useEffect:vi.fn(),useMemo:vi.fn(),useCallback:vi.fn(),useContext:vi.fn()}));
type Context=ReturnType<typeof useSession>;
type Hooks={states:unknown[];refs:Array<{current:unknown}>;effects:Array<{deps?:React.DependencyList;cleanup?:() => void}>;memos:Array<{deps?:React.DependencyList;value:unknown}>;state:number;ref:number;effect:number;memo:number};
function hooks():Hooks {return {states:[],refs:[],effects:[],memos:[],state:0,ref:0,effect:0,memo:0};}
function mount() {
  const events=new EventTarget();
  const channels:Array<{onmessage:((event:{data:string}) => void) | null}>=[];
  vi.stubGlobal('BroadcastChannel',class {
    onmessage:((event:{data:string}) => void) | null=null;
    constructor() {channels.push(this);}
    postMessage() {} close() {}
  });
  vi.stubGlobal('window',{addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),setInterval:vi.fn(() => 0),clearInterval:vi.fn()});
  vi.stubGlobal('document',{addEventListener:vi.fn(),removeEventListener:vi.fn(),visibilityState:'visible'});
  const provider=hooks(),viewer=hooks(),jobs:Array<() => void>=[];
  let active=provider,dirty=true,viewerId='',context:Context;
  const equal=(a?:React.DependencyList,b?:React.DependencyList) => Boolean(a && b && a.length===b.length && a.every((value,index) => Object.is(value,b[index])));
  vi.mocked(React.useState).mockImplementation((<T,>(initial:T | (() => T)) => {
    const owner=active,index=owner.state++;if (!(index in owner.states)) owner.states[index]=typeof initial==='function' ? (initial as () => T)() : initial;
    return [owner.states[index],(next:T | ((old:T) => T)) => {const value=typeof next==='function' ? (next as (old:T) => T)(owner.states[index] as T) : next;if (!Object.is(value,owner.states[index])) {owner.states[index]=value;dirty=true;}}];
  }) as typeof React.useState);
  vi.mocked(React.useRef).mockImplementation((<T,>(initial:T) => active.refs[active.ref++] ??= {current:initial}) as typeof React.useRef);
  vi.mocked(React.useEffect).mockImplementation((effect,deps) => {const owner=active,index=owner.effect++;if (owner.effects[index] && equal(owner.effects[index].deps,deps)) return;jobs.push(() => {owner.effects[index]?.cleanup?.();const cleanup=effect();owner.effects[index]={deps,cleanup:typeof cleanup==='function' ? cleanup : undefined};});});
  const memo=<T,>(create:() => T,deps?:React.DependencyList):T => {const owner=active,index=owner.memo++;if (owner.memos[index] && equal(owner.memos[index].deps,deps)) return owner.memos[index].value as T;const value=create();owner.memos[index]={deps,value};return value;};
  vi.mocked(React.useMemo).mockImplementation(memo);
  vi.mocked(React.useCallback).mockImplementation(((fn:(...args:never[]) => unknown,deps:React.DependencyList) => memo(() => fn,deps)) as typeof React.useCallback);
  vi.mocked(React.useContext).mockImplementation(() => context);
  function render(owner:Hooks,callback:() => void) {active=owner;owner.state=0;owner.ref=0;owner.effect=0;owner.memo=0;callback();}
  return {viewerId:() => viewerId,broadcast:(message:string) => channels[0].onmessage?.({data:message}),async flush() {
    let idle=0;
    for (let pass=0;pass<20;pass++) {
      if (dirty) {dirty=false;render(provider,() => {context=(SessionProvider({children:null}) as React.ReactElement<{value:Context}>).props.value;});render(viewer,() => {viewerId=useHermesViewerId();});}
      for (const job of jobs.splice(0)) job();for (let turn=0;turn<6;turn++) await Promise.resolve();
      idle=!dirty && !jobs.length ? idle+1 : 0;if (idle===3) return;
    }
    throw new Error('Session consumer did not settle');
  }};
}
beforeEach(() => {vi.resetAllMocks();api.getCurrentUser.mockResolvedValue({userId:'actor-a'});});
afterEach(() => {vi.unstubAllGlobals();});

it('takes its identity from the real SessionProvider without a duplicate mount read',async () => {
  const host=mount();await host.flush();
  expect(host.viewerId()).toBe('actor-a');expect(api.getCurrentUser).toHaveBeenCalledTimes(1);
});
it('clears the old actor during a real cross-tab changed event, then exposes the new actor',async () => {
  const host=mount();await host.flush();
  let release!:(user:{userId:string}) => void;
  api.getCurrentUser.mockImplementation(() => new Promise(resolve => {release=resolve;}));
  host.broadcast('changed');await host.flush();
  expect(api.invalidateSessionClientCache).toHaveBeenCalled();expect(api.getCurrentUser).toHaveBeenLastCalledWith({fresh:true});
  expect(host.viewerId()).toBe('');
  release({userId:'actor-b'});await host.flush();expect(host.viewerId()).toBe('actor-b');
});
it('clears the actor on a real cross-tab invalidation without issuing a paid action or extra identity read',async () => {
  const host=mount();await host.flush();host.broadcast('invalidated');await host.flush();
  expect(host.viewerId()).toBe('');expect(api.getCurrentUser).toHaveBeenCalledTimes(1);
});
