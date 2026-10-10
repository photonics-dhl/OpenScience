'use client';

import Link from 'next/link';
import { useLocale } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { getPublicAcademicProfile, type ProfileWork, type PublicAcademicProfile } from '@/lib/academic-profile';
import { ApiClientError } from '@/lib/api';
import { academicProfileCopy } from '@/lib/academic-profile-copy';
import styles from './academic-profile.module.css';

function External({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className={styles.link}>{children} ↗</a>;
}
function isOrcidUrl(url: string) { return /^https:\/\/orcid\.org\/[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9X]{4}$/.test(url); }

export function AcademicProfileView({ userId, preview }: { userId: string; preview?: PublicAcademicProfile }) {
  const locale = useLocale(); const t = academicProfileCopy[locale === 'en' ? 'en' : 'zh'];
  const [data, setData] = useState<PublicAcademicProfile | null>(null);
  const [error, setError] = useState<'missing' | 'network' | null>(null); const [busy, setBusy] = useState(true); const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<ProfileWork | 'team' | 'education' | 'media' | 'contact' | 'share' | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const dialog = useRef<HTMLDialogElement>(null); const opener = useRef<HTMLElement | null>(null);
  useEffect(() => { if (preview) return; let active = true; setBusy(true); setError(null); getPublicAcademicProfile(userId).then(value => { if (active) setData(value); }).catch(cause => { if (active) setError(cause instanceof ApiClientError && cause.status === 404 ? 'missing' : 'network'); }).finally(() => { if (active) setBusy(false); }); return () => { active = false; }; }, [userId, !!preview, reload]);
  function open(value: ProfileWork | 'team' | 'education' | 'media' | 'contact' | 'share', element: HTMLElement) { opener.current = element; if (value === 'share') setCopyStatus(''); setSelected(value); dialog.current?.showModal(); }
  function close() { dialog.current?.close(); }
  const shown = preview ?? data; const p = shown?.profile;
  if (!preview && busy) return <div className={styles.container}><p role="status">{t.loading}</p></div>;
  if (error || !p) return <div className={styles.container}><p role="status">{error === 'missing' ? t.unavailable : t.loadError}</p>{error !== 'missing' && <button className={styles.buttonSecondary} onClick={() => setReload(value => value + 1)}>{t.retry}</button>}</div>;
  const canonical = typeof window === 'undefined' ? '' : new URL(`/researchers/${userId}`, window.location.origin).href;
  async function share() { try { await navigator.clipboard.writeText(canonical); setCopyStatus(t.copied); } catch { setCopyStatus(t.copyFailed); } }
  return <div className={styles.container} id="academic-profile">
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/who-we-serve/researchers">Researcher</Link><span aria-hidden="true">/</span><span>{preview ? t.ownerTitle : t.pageTitle}</span></nav>
    <div className={styles.banner}><div><h1>{preview ? t.ownerTitle : t.pageTitle}</h1><p>{t.purpose}</p></div>{!preview && <button className={styles.button} onClick={event => open('share',event.currentTarget)}>{t.share}</button>}</div>
    <p className={styles.status} role="status">{copyStatus}</p>
    <div className={styles.layout}><aside className={styles.identity}>
      {p.avatar ? <img className={styles.avatar} src={p.avatar} alt={p.name} /> : <div className={styles.monogram} aria-hidden="true">{Array.from(p.name)[0]}</div>}
      <h2>{p.name}</h2>{p.englishName && <p className={styles.english}>{p.englishName}</p>}
      {(p.title || p.institution) && <p>{[p.title, p.institution].filter(Boolean).join(' · ')}</p>}
      {p.lab && <p>{p.lab}</p>}
      {p.bio && <section><h3>{t.bio}</h3><p>{p.bio}</p></section>}
      {(p.contactEmail || (p.orcid && isOrcidUrl(p.orcid)) || p.scholar || p.personalLinks.length > 0) && <section><h3>{t.contact}</h3><div className={styles.linkList}>
        {p.contactEmail && <button className={styles.link} onClick={event => open('contact', event.currentTarget)}>{t.email}</button>}
        {p.orcid && isOrcidUrl(p.orcid) && <span><External href={p.orcid}>ORCID</External>{shown?.orcidVerified && <span className={styles.verified}>✓ {t.orcidVerified}</span>}</span>}{p.scholar && <External href={p.scholar}>Google Scholar</External>}
        {p.personalLinks.map((link, i) => <External key={i} href={link.url}>{link.label}</External>)}
      </div></section>}
    </aside><div className={styles.cards}>
      {p.works.length > 0 && <section className={styles.card}><header><span>01</span><h2>{t.works}</h2></header><div className={styles.items} data-columns={Math.min(p.works.length, 3)}>{p.works.map((work, i) => <article key={i}>
        {(work.category || work.period) && <p className={styles.meta}>{[work.category, work.period].filter(Boolean).join(' · ')}</p>}
        <h3><button className={styles.detail} onClick={event => open(work, event.currentTarget)}>{work.shortTitle}</button></h3>
        {work.outcome && <p><strong>{t.outcome}：</strong>{work.outcome}</p>}
        {work.summary && <p><strong>{t.role}：</strong>{work.summary}</p>}
        {work.capabilities.length > 0 && <ul className={styles.tags}>{work.capabilities.map((capability, j) => <li key={j}>{capability}</li>)}</ul>}
        {work.links.length > 0 && <div className={styles.linkList}>{work.links.map((link, j) => <External key={j} href={link.url}>{link.label}</External>)}</div>}
      </article>)}</div></section>}
      {p.interests.some(item => item.active) && <section className={styles.card}><header><span>02</span><h2>{t.interests}</h2></header><div className={styles.items} data-columns={Math.min(p.interests.filter(item => item.active).length, 3)}>{p.interests.filter(item => item.active).map((item, i) => <article key={i}><p className={styles.meta}>{t.interestKinds[item.kind]}</p><h3>{item.title}</h3>{item.body && <p>{item.body}</p>}{item.contact && <p>{item.contact}</p>}{p.contactEmail && <button className={styles.link} onClick={event => open('contact',event.currentTarget)}>{t.contactAction}</button>}</article>)}</div></section>}
      {(preview || p.materials.length > 0 || p.cv || p.teamLinks.length > 0 || p.education.length > 0 || shown!.publications.length > 0) && <section className={styles.card}><header><span>03</span><h2>{t.more}</h2></header>
        <div className={styles.moreGroups}>
          {(preview || p.teamLinks.length > 0) && <section><h3><button className={styles.detail} onClick={event => open('team', event.currentTarget)}>{t.team}</button></h3>{preview && <p className={styles.muted}>{t.teamHint}</p>}</section>}
          {(preview || p.education.length > 0) && <section><h3><button className={styles.detail} onClick={event => open('education', event.currentTarget)}>{t.education}</button></h3>{preview && <p className={styles.muted}>{t.educationHint}</p>}</section>}
          {(preview || p.materials.length > 0) && <section><h3><button className={styles.detail} onClick={event => open('media', event.currentTarget)}>{t.media}</button></h3>{preview && <p className={styles.muted}>{t.mediaHint}</p>}</section>}
        </div>
        {p.cv && <div className={styles.moreLinks}><External href={p.cv}>{t.cv}</External></div>}
        {shown!.publications.length > 0 && <div className={styles.publications}><h3>{t.published}</h3><ul>{shown!.publications.map((item, i) => <li key={i}><Link href={`/research/${encodeURIComponent(item.publicId!)}`}>{item.title}</Link></li>)}</ul></div>}
      </section>}
    </div></div>
    <dialog ref={dialog} className={styles.dialog} aria-label={selected === 'share' ? t.share : selected === 'contact' ? t.contact : selected === 'education' ? t.education : selected === 'team' ? t.team : selected === 'media' ? t.media : selected?.fullTitle || selected?.shortTitle || t.detail} onClose={() => { setSelected(null); opener.current?.focus(); }} onClick={event => { if (event.target === dialog.current) close(); }}>
      <div className={styles.dialogBody}><button className={styles.close} onClick={close} aria-label={t.close}>×</button>
        {selected === 'share' ? <><h2>{t.share}</h2><input className={styles.shareInput} aria-label={t.share} readOnly value={canonical} onFocus={event => event.currentTarget.select()} /><button className={styles.button} onClick={() => void share()}>{t.share}</button><p role="status">{copyStatus}</p></> : selected === 'contact' ? <><h2>{t.contact}</h2><p>{p.contactEmail}</p><a className={styles.link} href={`mailto:${p.contactEmail}`}>{p.contactEmail}</a></> : selected === 'team' ? <><h2>{t.team}</h2>{p.teamLinks.length ? <div className={styles.linkList}>{p.teamLinks.map((link,i) => <External href={link.url} key={i}>{link.label}</External>)}</div> : <p>{t.teamHint}</p>}</> : selected === 'media' ? <><h2>{t.media}</h2>{p.materials.length ? <div className={styles.linkList}>{p.materials.map((link,i) => <External href={link.url} key={i}>{link.label}</External>)}</div> : <p>{t.mediaHint}</p>}</> : selected === 'education' ? <><h2>{t.education}</h2>{p.education.length ? p.education.map((item, i) => <section key={i}><p className={styles.meta}>{[item.stage,item.period].filter(Boolean).join(' · ')}</p><h3>{item.title}</h3><p>{item.details}</p>{item.links.length > 0 && <div className={styles.linkList}>{item.links.map((link,j) => <External href={link.url} key={j}>{link.label}</External>)}</div>}</section>) : <p>{t.educationHint}</p>}</> : selected ? <><p className={styles.meta}>{selected.category}</p><h2>{selected.fullTitle || selected.shortTitle}</h2>{selected.problem && <section><h3>{t.problem}</h3><p>{selected.problem}</p></section>}{selected.outcome && <section><h3>{t.outcome}</h3><p>{selected.outcome}</p></section>}{selected.contribution && <section><h3>{t.role}</h3><p>{selected.contribution}</p></section>}{selected.process && <section><h3>{t.process}</h3><p>{selected.process}</p></section>}{selected.capabilities.length > 0 && <section><h3>{t.capabilities}</h3><ul className={styles.tags}>{selected.capabilities.map((item,i) => <li key={i}>{item}</li>)}</ul></section>}{selected.links.length > 0 && <section><h3>{t.related}</h3><div className={styles.linkList}>{selected.links.map((link, i) => <External key={i} href={link.url}>{link.label}</External>)}</div></section>}</> : null}
      </div>
    </dialog>
  </div>;
}
