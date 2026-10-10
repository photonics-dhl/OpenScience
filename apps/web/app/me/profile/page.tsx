'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/components/auth/SessionProvider';
import { DashboardShell } from '@/components/shell/DashboardShell';
import { ApiClientError, beginOrcidConnection } from '@/lib/api';
import { emptyLink, emptyWork, getOwnAcademicProfile, publishAcademicProfile, saveAcademicProfile, unpublishAcademicProfile, type AcademicProfile, type OwnerAcademicProfile, type ProfileLink } from '@/lib/academic-profile';
import { academicProfileCopy } from '@/lib/academic-profile-copy';
import { AcademicProfileView } from '@/components/profile/AcademicProfileView';
import styles from '@/components/profile/academic-profile.module.css';

function urlIsSafe(value: string) { if (!value) return true; try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password; } catch { return false; } }
const orcidUrl = /^https:\/\/orcid\.org\/[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9X]{4}$/;

export default function AcademicProfileEditor() {
  const locale = useLocale(); const t = academicProfileCopy[locale === 'en' ? 'en' : 'zh'];
  const router = useRouter(); const { user, status, refresh } = useSession();
  const owner = useRef<string | undefined>(undefined); owner.current = status === 'authenticated' ? user?.userId : undefined;
  const avatarReadId = useRef(0);
  const [saved, setSaved] = useState<OwnerAcademicProfile | null>(null); const [profile, setProfile] = useState<AcademicProfile | null>(null);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [reload, setReload] = useState(0); const [conflict, setConflict] = useState(false);
  const [avatarReading, setAvatarReading] = useState(false);
  useEffect(() => { if (status === 'anonymous') router.replace('/auth/login?returnTo=%2Fme%2Fprofile'); }, [status, router]);
  useEffect(() => {
    if (status !== 'authenticated' || !user) { setSaved(null); setProfile(null); return; }
    let active = true; avatarReadId.current++; setLoading(true); setSaved(null); setProfile(null); setBusy(false); setConflict(false); setAvatarReading(false); setMessage('');
    getOwnAcademicProfile().then(value => { if (!active || owner.current !== user.userId) return; if (value.userId !== user.userId) { setMessage(t.loadError); void refresh(true); return; } setSaved(value); setProfile(value.profile); })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : t.unavailable); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [status, user?.userId, reload]);
  if (status !== 'authenticated' || !user) return <DashboardShell activeRoute="profile" skipLabel={t.pageTitle}><p>{t.loading}</p></DashboardShell>;
  const dirty = !!saved && saved.userId === user.userId && !!profile && JSON.stringify(saved.profile) !== JSON.stringify(profile);
  function top<K extends keyof AcademicProfile>(key: K, value: AcademicProfile[K]) { setProfile(current => current ? { ...current, [key]: value } : current); setMessage(''); }
  function field(key: keyof AcademicProfile, label: string, multiline = false) {
    const value = profile?.[key]; if (typeof value !== 'string') return null;
    return <label className={styles.field} key={key}>{label}{multiline ? <textarea value={value} onChange={event => top(key, event.target.value as never)} /> : <input value={value} onChange={event => top(key, event.target.value as never)} />}</label>;
  }
  function updateWork(i: number, key: keyof AcademicProfile['works'][number], value: string) { if (!profile) return; const works = [...profile.works]; works[i] = { ...works[i], [key]: value }; top('works', works); }
  function updateWorkLink(i: number, j: number, key: 'label' | 'url', value: string) { if (!profile) return; const works = [...profile.works]; const links = [...works[i].links]; links[j] = { ...links[j], [key]: value }; works[i] = { ...works[i], links }; top('works', works); }
  function urlsValid(p: AcademicProfile) { return [p.orcid, p.scholar, p.cv, p.labUrl, ...p.personalLinks.map(x => x.url), ...p.teamLinks.map(x => x.url), ...p.materials.map(x => x.url), ...p.works.flatMap(x => x.links.map(y => y.url)), ...p.education.flatMap(x => [x.url, ...x.links.map(y => y.url)])].every(urlIsSafe); }
  function missingRequired(p: AcademicProfile): string | null {
    for (const [i, item] of p.works.entries()) {
      if (!item.shortTitle.trim()) return `${t.requiredField}${t.works} ${i + 1} · ${t.shortTitle}`;
      if (!saved?.profile.works[i] && (!item.outcome.trim() || !item.summary.trim())) return `${t.requiredField}${t.works} ${i + 1} · ${!item.outcome.trim() ? t.outcome : t.summary}`;
      if (item.capabilities.some(value => !value.trim())) return `${t.requiredField}${t.works} ${i + 1} · ${t.capabilities}`;
      for (const [j, link] of item.links.entries()) if (!link.label.trim() || !link.url.trim()) return `${t.requiredField}${t.works} ${i + 1} · ${t.links} ${j + 1} · ${!link.label.trim() ? t.linkLabel : t.linkUrl}`;
    }
    for (const [i, item] of p.interests.entries()) if (!item.title.trim()) return `${t.requiredField}${t.interests} ${i + 1} · ${t.interestTitle}`;
    for (const [i, item] of p.materials.entries()) if (!item.label.trim() || !item.url.trim()) return `${t.requiredField}${t.more} ${i + 1} · ${!item.label.trim() ? t.linkLabel : t.linkUrl}`;
    for (const [section, links] of [[t.personalLinks,p.personalLinks],[t.team,p.teamLinks]] as const) for (const [i,link] of links.entries()) if (!link.label.trim() || !link.url.trim()) return `${t.requiredField}${section} ${i+1} · ${!link.label.trim() ? t.linkLabel : t.linkUrl}`;
    for (const [i, item] of p.education.entries()) if (!item.title.trim()) return `${t.requiredField}${t.education} ${i + 1} · ${t.educationTitle}`;
    for (const [i, item] of p.education.entries()) for (const [j,link] of item.links.entries()) if (!link.label.trim() || !link.url.trim()) return `${t.requiredField}${t.education} ${i+1} · ${t.links} ${j+1} · ${!link.label.trim() ? t.linkLabel : t.linkUrl}`;
    return null;
  }
  async function save() {
    if (!saved || !profile || busy || avatarReading || !dirty || conflict) return;
    const missing = missingRequired(profile); if (missing) { setMessage(missing); return; }
    if (!urlsValid(profile)) { setMessage(t.invalidUrl); return; }
    if (profile.orcid && !orcidUrl.test(profile.orcid)) { setMessage(t.orcidInvalid); return; }
    if (profile.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.contactEmail)) { setMessage(t.invalidEmail); return; }
    const userId = user!.userId; setBusy(true); setMessage(t.saving);
    try { const result = await saveAcademicProfile({ ownerId: userId, expectedVersion: saved.version, profile }); if (owner.current === userId) { if (result.userId !== userId) { setMessage(t.loadError); void refresh(true); return; } setSaved(result); setProfile(result.profile); setMessage(t.saved); } }
    catch (error) { if (owner.current === userId) { if (error instanceof ApiClientError && error.status === 409) setConflict(true); setMessage(error instanceof ApiClientError && error.status === 409 ? t.conflict : error instanceof Error ? error.message : t.loadError); } }
    finally { if (owner.current === userId) setBusy(false); }
  }
  async function transition(mode: 'publish' | 'unpublish') {
    if (!saved || busy || dirty || conflict || avatarReading) { setMessage(t.saveFirst); return; }
    const userId = user!.userId; setBusy(true); setMessage(t.saving);
    try {
      if (mode === 'publish') { const result = await publishAcademicProfile(userId, saved.version); if (owner.current === userId) { if (result.userId !== userId) { setMessage(t.loadError); void refresh(true); return; } setSaved(result); setMessage(t.publishedMessage); } }
      else { const result = await unpublishAcademicProfile(userId, saved.version); if (owner.current === userId) { if (result.userId !== userId) { setMessage(t.loadError); void refresh(true); return; } setSaved({ ...saved, version: result.version, published: false }); setMessage(t.unpublishedMessage); } }
    } catch (error) { if (owner.current === userId) { if (error instanceof ApiClientError && error.status === 409) setConflict(true); setMessage(error instanceof ApiClientError && error.status === 409 ? t.conflict : error instanceof Error ? error.message : t.loadError); } }
    finally { if (owner.current === userId) setBusy(false); }
  }
  async function upload(file: File | undefined) {
    if (!file) return; if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 262144) { setMessage(t.invalidAvatar); return; }
    const userId = user!.userId; const readId = ++avatarReadId.current; setAvatarReading(true); const reader = new FileReader(); reader.onload = () => { if (owner.current !== userId || avatarReadId.current !== readId) return; if (typeof reader.result === 'string') top('avatar', reader.result); setAvatarReading(false); }; reader.onerror = () => { if (owner.current !== userId || avatarReadId.current !== readId) return; setMessage(t.invalidAvatar); setAvatarReading(false); }; reader.readAsDataURL(file);
  }
  async function connectOrcid() {
    if (!saved || !saved.version || dirty || busy || conflict || avatarReading) { setMessage(t.orcidSaveFirst); return; }
    setBusy(true); setMessage(t.saving);
    try {
      const { authorizationUrl } = await beginOrcidConnection('/me/profile');
      window.location.assign(authorizationUrl);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : t.loadError); setBusy(false); }
  }
  function linksEditor(links: ProfileLink[], onChange: (next: ProfileLink[]) => void, addLabel: string) {
    return <div>{links.map((link, i) => <div className={styles.entry} key={i}><div className={styles.fieldGrid}>
      <label className={styles.field}>{t.linkLabel}<input value={link.label} onChange={event => onChange(links.map((item,j) => j===i ? { ...item, label:event.target.value } : item))} /></label>
      <label className={styles.field}>{t.linkUrl}<input value={link.url} onChange={event => onChange(links.map((item,j) => j===i ? { ...item, url:event.target.value } : item))} /></label>
    </div><button className={styles.link} onClick={() => onChange(links.filter((_,j) => j!==i))}>{t.remove}</button></div>)}
      <button className={styles.buttonSecondary} onClick={() => onChange([...links, emptyLink()])}>{addLabel}</button>
    </div>;
  }
  const connectedOrcid = saved?.userId === user.userId ? saved.connectedOrcid : null;
  if (!editing) return <DashboardShell activeRoute="profile" skipLabel={t.pageTitle}><div className={styles.editor}>
    <div className={styles.actions}><Link href="/me" className={styles.link}>← {t.identity}</Link><button className={styles.button} onClick={() => setEditing(true)}>{t.editor}</button>{saved?.userId === user.userId && saved.published && <Link href={`/researchers/${user.userId}`} className={styles.link}>{t.preview}</Link>}</div>
    <p className={styles.notice}>{saved?.userId === user.userId && saved.published ? t.publishedState : t.unpublished} · {t.privateHint}</p>
    {loading || !profile || !saved || saved.userId !== user.userId ? <div><p role="status">{message || t.loading}</p>{!loading && <button className={styles.buttonSecondary} onClick={() => setReload(value => value + 1)}>{t.retry}</button>}</div> : <>
      {(saved.version === 0 || (!profile.works.length && !profile.interests.length && !profile.materials.length && !profile.bio)) && <div className={styles.editorSection}><p className={styles.notice}>{t.emptyHint}</p><div className={styles.actions}><button className={styles.link} onClick={() => setEditing(true)}>{t.works} →</button><button className={styles.link} onClick={() => setEditing(true)}>{t.interests} →</button><button className={styles.link} onClick={() => setEditing(true)}>{t.more} →</button></div></div>}
      <AcademicProfileView userId={user.userId} preview={{ profile, publications: [], orcidVerified: profile.orcid === saved.profile.orcid && saved.orcidVerified }} />
    </>}
  </div></DashboardShell>;
  return <DashboardShell activeRoute="profile" skipLabel={t.pageTitle}><div className={styles.editor}>
    <button className={styles.link} onClick={() => setEditing(false)}>← {t.pageTitle}</button><h1>{t.editor}</h1><p className={styles.notice}>{t.privateHint}</p>
    {loading || !profile || !saved || saved.userId !== user.userId ? <div><p role="status">{message || t.loading}</p>{!loading && <button className={styles.buttonSecondary} onClick={() => setReload(value => value + 1)}>{t.retry}</button>}</div> : <>
      <div className={styles.actions}><span className={styles.notice}>{saved.published ? t.publishedState : t.unpublished}</span>
        <button className={styles.button} disabled={busy || avatarReading || !dirty || conflict} onClick={() => void save()}>{busy ? t.saving : t.draft}</button>
        <button className={styles.buttonSecondary} disabled={busy || avatarReading || conflict || dirty || !profile.name.trim() || !saved.version} onClick={() => void transition('publish')}>{t.publish}</button>
        {saved.published && <button className={styles.buttonSecondary} disabled={busy || avatarReading || conflict || dirty} onClick={() => void transition('unpublish')}>{t.unpublish}</button>}
        {saved.published && <Link className={styles.link} href={`/researchers/${user.userId}`}>{t.preview}</Link>}
      </div><p role="status" className={styles.notice}>{message || (!profile.name ? t.emptyHint : '')}</p>{conflict && <button className={styles.buttonSecondary} onClick={() => setReload(value => value + 1)}>{t.discardReload}</button>}
      <fieldset disabled={busy} className={styles.editorFields}><section className={styles.editorSection}><h2>{t.identity}</h2><label className={styles.field}>{t.avatar}<input type="file" disabled={avatarReading} accept="image/png,image/jpeg,image/webp" onChange={event => void upload(event.target.files?.[0])} /></label>
        {profile.avatar && <img src={profile.avatar} alt="" className={styles.avatar} />}
        <div className={styles.fieldGrid}>{field('name', t.name)}{field('englishName', t.englishName)}{field('title', t.title)}{field('institution', t.institution)}{field('lab', t.labName)}{field('bio', t.bio, true)}{field('contactEmail', t.contactEmail)}{field('orcid', t.orcid)}{field('scholar', t.scholar)}</div>
        <div className={styles.actions}><span className={styles.notice}>{connectedOrcid ? `${t.orcidVerified}: ${connectedOrcid}` : t.orcidUnverified}</span>
          {connectedOrcid && <button className={styles.buttonSecondary} onClick={() => top('orcid', `https://orcid.org/${connectedOrcid}`)}>{t.useVerifiedOrcid}</button>}
          <button className={styles.buttonSecondary} disabled={!saved.version || dirty || conflict || avatarReading} onClick={() => void connectOrcid()}>{t.connectOrcid}</button></div>
        <h3>{t.personalLinks}</h3>{linksEditor(profile.personalLinks, next => top('personalLinks', next), t.addLink)}
      </section>
      <section className={styles.editorSection}><h2>{t.works}</h2>{profile.works.map((work, i) => <div className={styles.entry} key={i}><div className={styles.actions}><h3>{work.shortTitle || `${t.works} ${i + 1}`}</h3><button className={styles.link} onClick={() => top('works', profile.works.filter((_, j) => i !== j))}>{t.remove}</button></div>
        <div className={styles.fieldGrid}>{([['category',t.workCategory],['period',t.period],['shortTitle',t.shortTitle],['outcome',t.outcome],['summary',t.summary],['fullTitle',t.fullTitle],['problem',t.workProblem],['contribution',t.contribution],['process',t.workProcess]] as const).map(([key,label]) => <label className={styles.field} key={key}>{label}{['outcome','summary','problem','contribution','process'].includes(key) ? <textarea value={work[key]} onChange={event => updateWork(i,key,event.target.value)} /> : <input value={work[key]} onChange={event => updateWork(i,key,event.target.value)} />}</label>)}</div>
        <h3>{t.capabilities}</h3>{work.capabilities.map((capability,j) => <div className={styles.actions} key={j}><label className={styles.field}>{t.capability}<input value={capability} onChange={event => { const works=[...profile.works]; works[i]={...work,capabilities:work.capabilities.map((item,k)=>k===j?event.target.value:item)}; top('works',works); }} /></label><button className={styles.link} onClick={() => { const works=[...profile.works]; works[i]={...work,capabilities:work.capabilities.filter((_,k)=>k!==j)}; top('works',works); }}>{t.remove}</button></div>)}<button className={styles.buttonSecondary} disabled={work.capabilities.length>=5} onClick={() => { const works=[...profile.works]; works[i]={...work,capabilities:[...work.capabilities,'']}; top('works',works); }}>{t.addCapability}</button>
        <h3>{t.links}</h3>{work.links.map((link,j) => <div className={styles.fieldGrid} key={j}><label className={styles.field}>{t.linkLabel}<input value={link.label} onChange={event => updateWorkLink(i,j,'label',event.target.value)} /></label><label className={styles.field}>{t.linkUrl}<input value={link.url} onChange={event => updateWorkLink(i,j,'url',event.target.value)} /></label><button className={styles.link} onClick={() => { const works=[...profile.works]; works[i]={...work,links:work.links.filter((_,k)=>k!==j)}; top('works',works); }}>{t.remove}</button></div>)}<button className={styles.buttonSecondary} onClick={() => { const works=[...profile.works]; works[i]={...work,links:[...work.links,emptyLink()]}; top('works',works); }}>{t.addLink}</button>
      </div>)}<button className={styles.buttonSecondary} onClick={() => top('works',[...profile.works,emptyWork()])}>{t.addWork}</button></section>
      <section className={styles.editorSection}><h2>{t.interests}</h2>{profile.interests.map((item,i) => <div className={styles.entry} key={i}><div className={styles.fieldGrid}>
        <label className={styles.field}>{t.interestKind}<select value={item.kind} onChange={event => top('interests',profile.interests.map((x,j)=>j===i?{...x,kind:event.target.value as typeof item.kind}:x))}>{Object.entries(t.interestKinds).map(([key,label]) => <option value={key} key={key}>{label}</option>)}</select></label>
        <label className={styles.field}>{t.interestTitle}<input value={item.title} onChange={event => top('interests',profile.interests.map((x,j)=>j===i?{...x,title:event.target.value}:x))} /></label>
        <label className={styles.field}>{t.interestBody}<textarea value={item.body} onChange={event => top('interests',profile.interests.map((x,j)=>j===i?{...x,body:event.target.value}:x))} /></label>
        <label className={styles.field}>{t.interestContact}<input value={item.contact} onChange={event => top('interests',profile.interests.map((x,j)=>j===i?{...x,contact:event.target.value}:x))} /></label></div>
        <label className={styles.check}><input type="checkbox" checked={item.active} onChange={event => top('interests',profile.interests.map((x,j)=>j===i?{...x,active:event.target.checked}:x))} />{item.active?t.interestActive:t.interestClosed}</label>
        <button className={styles.link} onClick={() => top('interests',profile.interests.filter((_,j)=>j!==i))}>{t.remove}</button></div>)}<button className={styles.buttonSecondary} onClick={() => top('interests',[...profile.interests,{title:'',body:'',kind:'custom',contact:'',active:true}])}>{t.addInterest}</button></section>
      <section className={styles.editorSection}><h2>{t.more}</h2>{field('cv',t.cvUrl)}
        <h3>{t.team}</h3><p className={styles.notice}>{t.teamHint}</p>{linksEditor(profile.teamLinks, next => top('teamLinks',next),t.addLink)}
        <h3>{t.education}</h3><p className={styles.notice}>{t.educationHint}</p>{profile.education.map((entry,i) => <div className={styles.entry} key={i}><div className={styles.fieldGrid}>
          <label className={styles.field}>{t.educationTitle}<input value={entry.title} onChange={event => top('education',profile.education.map((x,j)=>j===i?{...x,title:event.target.value}:x))} /></label>
          <label className={styles.field}>{t.educationStage}<input value={entry.stage} onChange={event => top('education',profile.education.map((x,j)=>j===i?{...x,stage:event.target.value}:x))} /></label>
          <label className={styles.field}>{t.educationPeriod}<input value={entry.period} onChange={event => top('education',profile.education.map((x,j)=>j===i?{...x,period:event.target.value}:x))} /></label>
          <label className={styles.field}>{t.educationDetails}<textarea value={entry.details} onChange={event => top('education',profile.education.map((x,j)=>j===i?{...x,details:event.target.value}:x))} /></label></div>
          {linksEditor(entry.links,next => top('education',profile.education.map((x,j)=>j===i?{...x,links:next}:x)),t.addLink)}
          <button className={styles.link} onClick={() => top('education',profile.education.filter((_,j)=>j!==i))}>{t.remove}</button></div>)}<button className={styles.buttonSecondary} onClick={() => top('education',[...profile.education,{title:'',details:'',url:'',stage:'',period:'',links:[]}])}>{t.addEducation}</button>
        <h3>{t.media}</h3><p className={styles.notice}>{t.mediaHint}</p>{linksEditor(profile.materials,next => top('materials',next),t.addMaterial)}
      </section></fieldset><div className={styles.actions}><button className={styles.button} disabled={busy || avatarReading || !dirty || conflict} onClick={() => void save()}>{busy ? t.saving : t.draft}</button><span role="status">{message}</span></div>
    </>}
  </div></DashboardShell>;
}
