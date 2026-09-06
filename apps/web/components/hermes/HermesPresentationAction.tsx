'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ApiClientError, getResearchObject, listVersions, listMyWorkspaces, listVersionClaims, listPresentationAssets, generatePresentationStoryboard, generatePresentationSceneImage, type PresentationClaim, type PresentationAsset, type VersionSummary, type WorkspaceApi, type StoryboardRequest } from '@/lib/api';
import { validPresentationInstruction, hasCurrentPresentationSources, presentationSources, selectPresentationVersion, SubmissionIntent, type PresentationAction } from '@/lib/hermes/presentation-action';
interface Props { researchObjectId: string; requestedVersionId?: string; intent: { action: PresentationAction; instruction: string; sceneIndex?: number }; onBack: () => void; onSubmitted: (url: string) => void; submissionRecords?: Map<string, SubmissionIntent>; onBusyChange?: (locked: boolean) => void }
const control = 'min-h-11 w-full rounded border border-os-rule-paper bg-os-paper px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink';
export function HermesPresentationAction(props: Props) {
  const t = useTranslations('hermesPresentation'); const locale = useLocale();
  const {researchObjectId: ro, requestedVersionId, intent, onBack, onSubmitted} = props;
  const context = JSON.stringify([ro, requestedVersionId, intent]); const rendered = useRef(context); rendered.current = context;
  const [data, setData] = useState<{context:string; title:string; versions:VersionSummary[]; workspace?:WorkspaceApi} | null>(null);
  const [versionId, setVersionId] = useState(''); const [action,setAction] = useState(intent.action);
  const [instruction,setInstruction] = useState(intent.instruction); const [style,setStyle] = useState<StoryboardRequest['style']>('watercolor');
  const [language,setLanguage] = useState<'zh'|'en'>(locale==='zh'?'zh':'en');
  const [claims,setClaims] = useState<PresentationClaim[]>([]); const [assets,setAssets] = useState<PresentationAsset[]>([]);
  const [selected,setSelected] = useState<string[]>([]); const [parentId,setParentId] = useState(''); const [scene,setScene] = useState(intent.sceneIndex ?? 0);
  const [ready,setReady] = useState(''); const [error,setError] = useState(''); const [busy,setBusy] = useState(false); const [uncertain,setUncertain] = useState(false); const [reload,setReload] = useState(0);
  const localRecords = useRef(new Map<string, SubmissionIntent>());
  const records = props.submissionRecords ?? localRecords.current;
  const submission = useRef(new SubmissionIntent()); const controller = useRef<AbortController | null>(null);
  const scope = `${context}:${versionId}`; const renderedScope = useRef(scope); renderedScope.current = scope;
  useEffect(() => {
    let active = true; setData(null); setVersionId(''); setError(''); setAction(intent.action); setInstruction(intent.instruction); setStyle('watercolor'); setLanguage(locale==='zh'?'zh':'en'); setScene(intent.sceneIndex ?? 0);
    void Promise.all([getResearchObject(ro),listVersions(ro),listMyWorkspaces()]).then(([r,v,w]) => {
      if (!active || rendered.current !== context) return;
      setData({context,title:r.researchObject.title,versions:v.versions,workspace:w.find(x=>x.id===r.researchObject.workspaceId)});
      setVersionId(selectPresentationVersion(v.versions,requestedVersionId)?.versionId ?? '');
    }).catch(()=>{if(active && rendered.current===context)setError('loadError');});
    return()=>{active=false;};
  },[context,ro,requestedVersionId,reload,locale,intent.action,intent.instruction,intent.sceneIndex]);
  useEffect(()=>{
    const abort = new AbortController(); controller.current=abort; let record=records.get(scope); if(!record){record=new SubmissionIntent();records.set(scope,record);} submission.current=record;
    setReady(''); setClaims([]); setAssets([]); setSelected([]); setParentId(''); setBusy(false); setUncertain(record.isUncertain);
    if(record.isUncertain && record.draft){const d=record.draft;setAction(d.action);setInstruction(d.instruction);setStyle(d.style);setLanguage(d.language ?? (locale==='zh'?'zh':'en'));setSelected(d.selected);setParentId(d.parentId);setScene(d.scene);}
    if(versionId && data?.context===context) void Promise.all([listVersionClaims(ro,versionId,abort.signal),listPresentationAssets(ro,versionId,abort.signal)]).then(([c,a])=>{
      if(abort.signal.aborted || renderedScope.current!==scope)return;
      setClaims(c.claims.filter(x=>x.researchObjectId===ro && x.versionId===versionId)); setAssets(a.assets.filter(x=>x.researchObjectId===ro && x.versionId===versionId)); setReady(scope);
    }).catch(()=>{if(!abort.signal.aborted && renderedScope.current===scope)setError('loadError');});
    return()=>{if(record.isBusy)record.fail(true);if(!record.isUncertain)records.delete(scope);abort.abort();};
  },[context,data,locale,records,ro,scope,versionId]);
  useEffect(()=>{props.onBusyChange?.(busy || uncertain);},[busy,uncertain,props.onBusyChange]);
  const version=data?.context===context ? data.versions.find(x=>x.versionId===versionId) : undefined;
  const canWrite=version?.status==='draft' && data?.workspace?.status==='active' && ['owner','maintainer','author','contributor'].includes(data.workspace.role ?? '');
  const parents=assets.filter(x=>x.storyboard && (x.status==='draft' || x.status==='approved') && (action!=='scene.image' || (x.status==='approved' && x.canGenerateSceneImage===true)));
  const parent=parents.find(x=>x.id===parentId);
  const ids=presentationSources(action,selected,parent,scene);
  const validSources=hasCurrentPresentationSources(ids,claims);
  const locked=busy || uncertain;
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if(!canWrite || ready!==scope || !validSources || (action!=='scene.image' && !validPresentationInstruction(instruction)))return;
    const request=action==='scene.image' ? {storyboardAssetId:parent!.id,sceneIndex:scene} : {locale:language,style,instruction:instruction.trim(),...(parent ? {baseAssetId:parent.id}: {})};
    submission.current.draft={action,instruction,style,language,selected:[...selected],parentId,scene};
    const key=submission.current.begin(JSON.stringify([ro,versionId,action,ids,request])); if(!key)return;
    const current=controller.current; setBusy(true); setError('');
    try {
      const result=action==='scene.image' ? await generatePresentationSceneImage(ro,versionId,ids,request as {storyboardAssetId:string;sceneIndex:number},key,current?.signal) : await generatePresentationStoryboard(ro,versionId,ids,request as StoryboardRequest,key,current?.signal);
      if(current?.signal.aborted || renderedScope.current!==scope)return;
      submission.current.complete(); props.onBusyChange?.(false);
      onSubmitted(`/research-objects/${encodeURIComponent(ro)}/presentation?${new URLSearchParams({version:versionId,task:result.task.id})}`);
    } catch(cause) {
      if(current?.signal.aborted || renderedScope.current!==scope)return;
      const ambiguous=!(cause instanceof ApiClientError) || cause.status===0 || cause.status===408 || cause.status===429 || cause.status>=500;
      submission.current.fail(ambiguous); setUncertain(ambiguous); setError(ambiguous?'uncertain':'submitError'); setBusy(false);
    }
  }
  return <section className="min-w-0 rounded-xl bg-os-paper p-4 text-os-ink-paper" data-hermes-presentation-action="true">
    <h3 className="m-0 text-lg font-semibold">{t('entry')}</h3><p className="text-sm leading-6">{t('boundary')}</p>
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={locked} className="m-0 min-w-0 space-y-4 border-0 p-0">
        <p className="break-words text-sm font-semibold">{data?.context===context?data.title:t('loading')}</p>
        <label className="grid gap-2 text-sm">{t('version')}<select className={control} value={versionId} onChange={e=>{setAction(intent.action);setInstruction('');setStyle('watercolor');setLanguage(locale==='zh'?'zh':'en');setScene(0);setError('');setVersionId(e.target.value);}}><option value="">{t('chooseVersion')}</option>{data?.context===context?data.versions.map(v=><option key={v.versionId} value={v.versionId}>{t('versionLabel',{number:v.versionNo,status:v.status})}</option>):null}</select></label>
        <label className="grid gap-2 text-sm">{t('action')}<select className={control} value={action} onChange={e=>{setAction(e.target.value as PresentationAction);setParentId('');}}>{(['storyboard.create','storyboard.revise','scene.image'] as const).map(a=><option key={a} value={a}>{t(a.replace('.','_'))}</option>)}</select></label>
        {action==='storyboard.create'?<div><p className="text-sm">{t('claims')}</p>{claims.filter(c=>c.extractionStatus==='succeeded').map(c=><label key={c.id} className="flex min-h-11 items-start gap-2 py-2 text-sm"><input type="checkbox" checked={selected.includes(c.id)} disabled={!selected.includes(c.id) && selected.length>=12} onChange={e=>setSelected(e.target.checked?[...selected,c.id]:selected.filter(id=>id!==c.id))}/><span className="min-w-0 break-words">{c.statement}</span></label>)}</div>:<>
          <label className="grid gap-2 text-sm">{t('parent')}<select className={control} value={parentId} onChange={e=>{setParentId(e.target.value);setScene(intent.sceneIndex ?? 0);const next=parents.find(p=>p.id===e.target.value);if(next?.storyboard){setStyle(next.storyboard.style);setLanguage(next.storyboard.locale);}}}><option value="">{t('chooseParent')}</option>{parents.map(p=><option key={p.id} value={p.id}>{p.storyboard?.document.title} · {t(p.status)}</option>)}</select></label>
          {parent?<ul className="space-y-2 pl-5 text-sm">{parent.sourceClaimIds.map(id=><li key={id}>{claims.find(c=>c.id===id)?.statement ?? t('staleSources')}</li>)}</ul>:null}
        </>}
        {action==='scene.image'?<><p className="text-sm leading-6">{t('imageInstruction')}</p><label className="grid gap-2 text-sm">{t('scene')}<select className={control} value={scene} onChange={e=>setScene(Number(e.target.value))}>{parent?.storyboard?.document.scenes.map((s,i)=><option key={i} value={i}>{i+1}. {s.title}</option>)}</select></label>{parent?.storyboard?.document.scenes[scene]?<p className="text-sm leading-6">{parent.storyboard.document.scenes[scene].visualAction}</p>:null}</>:<>
          <label className="grid gap-2 text-sm">{t('style')}<select className={control} value={style} onChange={e=>setStyle(e.target.value as StoryboardRequest['style'])}>{(['watercolor','technical','ink'] as const).map(s=><option key={s} value={s}>{t(s)}</option>)}</select></label>
          <label className="grid gap-2 text-sm">{t('language')}<select className={control} value={language} onChange={e=>setLanguage(e.target.value as 'zh'|'en')}><option value="zh">中文</option><option value="en">English</option></select></label>
          <label className="grid gap-2 text-sm">{t('instruction')}<textarea className={`${control} min-h-24`} maxLength={1000} required value={instruction} onChange={e=>setInstruction(e.target.value)}/></label>
        </>}
      </fieldset>
      {!canWrite && data?<p role="status" className="text-sm">{t('readOnly')}</p>:null}
      <p className="text-sm leading-6">{t('charge')}</p>
      {action!=='scene.image' && instruction.length>1000?<p role="alert" className="text-sm">{t('instructionLimit')}</p>:null}
      {parent && !validSources?<p role="alert" className="text-sm">{t('staleSources')}</p>:null}
      {error?<p role="alert" className="text-sm">{t(error)}</p>:null}
      {!locked && (error==='loadError' || error==='submitError' || (parent && !validSources))?<button type="button" className={control} onClick={()=>setReload(x=>x+1)}>{t('refresh')}</button>:null}
      <button type="submit" className="min-h-11 w-full rounded bg-os-ink-paper px-4 py-2 text-sm font-semibold text-os-paper disabled:opacity-40" disabled={busy || !canWrite || ready!==scope || !validSources || (action!=='scene.image' && !validPresentationInstruction(instruction))}>{t(busy?'submitting':uncertain?'retry':'confirm')}</button>
    </form>
    <button type="button" className="mt-3 min-h-11 px-2 text-sm underline" disabled={busy || uncertain} onClick={onBack}>{t('back')}</button>
  </section>;
}
