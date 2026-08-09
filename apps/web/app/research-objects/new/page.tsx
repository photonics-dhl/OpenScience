'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useEffect, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createResearchObjectWithMaterials, listMyWorkspaces, type MaterialImportCheckpoint, type WorkspaceApi } from '@/lib/api';

const IMPORT_CHECKPOINT_KEY = 'openscience.material-import-checkpoint';

export default function NewResearchObjectPage() {
  const t = useTranslations('createResearch');
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') === 'blank' ? 'blank' : 'import';
  const [workspaces, setWorkspaces] = useState<WorkspaceApi[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [title, setTitle] = useState('');
  const [materials, setMaterials] = useState<File[]>([]);
  const [importCheckpoint, setImportCheckpoint] = useState<MaterialImportCheckpoint>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    listMyWorkspaces()
      .then((rows) => {
        if (!active) return;
        setWorkspaces(rows);
        setWorkspaceId((current) => current || rows[0]?.id || '');
      })
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : t('error')));
    return () => { active = false; };
  }, [t]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(IMPORT_CHECKPOINT_KEY);
      if (saved) {
        const checkpoint = JSON.parse(saved) as MaterialImportCheckpoint;
        if (checkpoint.mode === mode) {
          setImportCheckpoint(checkpoint);
          setTitle(checkpoint.title);
          setWorkspaceId(checkpoint.workspaceId);
        }
      }
    } catch {
      window.localStorage.removeItem(IMPORT_CHECKPOINT_KEY);
    }
  }, [mode]);

  function persistCheckpoint(checkpoint: MaterialImportCheckpoint) {
    setImportCheckpoint(checkpoint);
    window.localStorage.setItem(IMPORT_CHECKPOINT_KEY, JSON.stringify(checkpoint));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId) return;
    setPending(true);
    setError('');
    try {
      if (mode === 'import' && materials.length === 0) {
        setError(t('materialsRequired'));
        return;
      }
      const result = await createResearchObjectWithMaterials(
        { workspaceId, title, mode },
        materials,
        undefined,
        importCheckpoint,
        persistCheckpoint,
      );
      setImportCheckpoint(undefined);
      window.localStorage.removeItem(IMPORT_CHECKPOINT_KEY);
      router.push(`/research-objects/${result.researchObject.id}/edit`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('error'));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="surface-dark surface-workbench min-h-screen bg-workbench-bg px-4 py-8 text-workbench-text sm:px-7 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <Link className="text-sm text-workbench-muted hover:text-workbench-text" href="/dashboard">← {t('back')}</Link>
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,.9fr)]">
          <section className="rounded-card border border-white/10 bg-workbench-surface p-6 sm:p-9">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-primary">Research Object</p>
            <h1 className="mt-3 font-display text-3xl font-semibold sm:text-5xl">{t('title')}</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-workbench-muted">{t('description')}</p>
            <form className="mt-8 grid gap-5" onSubmit={submit}>
              <label className="grid gap-2 text-sm font-medium">
                {t('workspace')}
                <select className="min-h-11 rounded-control border border-white/15 bg-workbench-bg px-3" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} required>
                  <option value="">{t('workspaceLoading')}</option>
                  {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium">
                {t('researchTitle')}
                <Input name="title" required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} />
              </label>
              {mode === 'import' ? (
                <label className="grid gap-2 text-sm font-medium">
                  {t('materials')}
                  <Input
                    type="file"
                    name="materials"
                    required
                    multiple
                    accept=".pdf,.doc,.docx,.tex,.zip,.md,.markdown,.png,.jpg,.jpeg,.webp,.svg"
                    onChange={(event) => setMaterials(Array.from(event.target.files ?? []))}
                  />
                  <span className="text-xs font-normal text-workbench-muted">{t('materialsHint')}</span>
                </label>
              ) : null}
              {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
              <Button size="lg" type="submit" disabled={pending || !workspaceId}>{pending ? t('creating') : t('create')}</Button>
            </form>
          </section>
          <aside className="rounded-card border border-white/10 bg-workbench-elevated p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-workbench-muted">Hermes</p>
            <h2 className="mt-3 font-display text-2xl font-semibold">{t('evidenceTitle')}</h2>
            <p className="mt-3 text-sm leading-6 text-workbench-muted">{t('evidenceBody')}</p>
            <ol className="mt-7 grid gap-4 text-sm">
              <li className="rounded-control border border-white/10 bg-workbench-bg p-4">01 · {t('stepStore')}</li>
              <li className="rounded-control border border-white/10 bg-workbench-bg p-4">02 · {t('stepParse')}</li>
              <li className="rounded-control border border-white/10 bg-workbench-bg p-4">03 · {t('stepConfirm')}</li>
            </ol>
          </aside>
        </div>
      </div>
    </main>
  );
}
