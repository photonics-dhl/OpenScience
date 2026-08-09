'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ApiClientError, createResearchObject, listWorkspaces, submitExtractTask } from '../../lib/api';
import { validateCreateInput, type CreateMode } from '../../lib/create-flow';

const blankCore = { schemaVersion: '0.1.0', problem: '', insight: '', method: '', results: '', limitations: '', reproducibility: '' };

export default function CreateResearchObjectFlow() {
  const t = useTranslations('create');
  const router = useRouter();
  const [title, setTitle] = React.useState('');
  const [mode, setMode] = React.useState<CreateMode>('blank');
  const [material, setMaterial] = React.useState('');
  const [disclosure, setDisclosure] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const validation = validateCreateInput({ title, mode, material, disclosure });
    if (!validation.ok) { setError(t(`errors.${validation.error}`)); return; }
    setError(null); setBusy(true);
    try {
      const { workspaces } = await listWorkspaces();
      const workspace = workspaces.find((item) => item.type === 'personal' && item.status === 'active') ?? workspaces.find((item) => item.status === 'active');
      if (!workspace) throw new Error('NO_WORKSPACE');
      const idempotencyKey = crypto.randomUUID();
      const { researchObject } = await createResearchObject({ workspaceId: workspace.id, title: title.trim(), sdf: { core: blankCore } }, idempotencyKey);
      if (mode === 'material') await submitExtractTask(researchObject.id, material.trim());
      router.push(`/research-objects/${researchObject.id}/workspace`);
    } catch (cause) {
      setBusy(false);
      setError(cause instanceof ApiClientError && cause.status === 401 ? t('errors.session') : t('errors.unknown'));
    }
  }

  return (
    <main className="auth-shell create-shell">
      <div className="auth-shell__inner">
        <header className="auth-intro"><span className="eyebrow">{t('eyebrow')}</span><h1>{t('title')}</h1><p>{t('description')}</p></header>
        <form className="auth-form create-form" onSubmit={submit} noValidate>
          <label><span>{t('fields.title')}</span><input value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus maxLength={200} /></label>
          <fieldset><legend>{t('mode.legend')}</legend><label className="create-choice"><input type="radio" checked={mode === 'blank'} onChange={() => setMode('blank')} />{t('mode.blank')}</label><label className="create-choice"><input type="radio" checked={mode === 'material'} onChange={() => setMode('material')} />{t('mode.material')}</label></fieldset>
          {mode === 'material' && <><label><span>{t('fields.material')}</span><textarea value={material} onChange={(event) => setMaterial(event.target.value)} rows={8} /></label><label className="create-consent"><input type="checkbox" checked={disclosure} onChange={(event) => setDisclosure(event.target.checked)} />{t('disclosure')}</label></>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary" type="submit" disabled={busy}>{busy ? t('actions.creating') : t('actions.create')}</button>
        </form>
      </div>
    </main>
  );
}
