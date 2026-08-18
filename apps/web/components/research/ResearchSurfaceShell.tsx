'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { WorkspaceShell } from '@/components/shell/WorkspaceShell';
import type { ProductSurfaceId } from '@/lib/product-surfaces';
import type { ResearchObjectSummary } from '@/lib/api';
import { ObjectHeader } from './ObjectHeader';
import { ResearchWorkspaceNav } from './ResearchWorkspaceNav';

type ResearchSurfaceId = Exclude<ProductSurfaceId, 'settings'>;

export function ResearchSurfaceShell({
  active,
  actions,
  children,
  object,
  rail,
}: {
  active: ResearchSurfaceId;
  actions?: ReactNode;
  children: ReactNode;
  object: ResearchObjectSummary;
  rail?: ReactNode;
}) {
  const t = useTranslations('productSurfaces');
  const fields = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'];
  return (
    <WorkspaceShell
      activeMobilePlane="main"
      leftRail={
        <div>
          <p data-reading-role="caption" className="font-data uppercase tracking-[0.1em] text-os-muted-dark">{t('objectMap')}</p>
          <ol className="mt-5 space-y-3">
            {fields.map((field, index) => <li className="flex gap-3 text-sm text-os-muted-dark" key={field}><span className="font-data text-xs text-os-vermilion">0{index + 1}</span><span>{t(`fields.${field}`)}</span></li>)}
          </ol>
        </div>
      }
      mainClassName="p-0 lg:p-0"
      navigationLabel={t('navigation')}
      objectHeader={<ObjectHeader actions={actions} objectId={object.id} saveState="saved" title={object.title} version={object.version} visibility={object.visibility} />}
      rightRail={rail ?? <div><p data-reading-role="caption" className="font-data uppercase tracking-[0.1em] text-os-muted-dark">{t('integrity')}</p><p className="mt-4 text-base leading-[var(--leading-body)] text-os-muted-dark">{t('integrityBody')}</p></div>}
      skipLabel={t('skip')}
      workspaceModes={<ResearchWorkspaceNav active={active} objectId={object.id} />}
    >
      <div className="min-h-[calc(100dvh-10.25rem)] px-4 py-7 sm:px-7 lg:px-10 lg:py-9">{children}</div>
    </WorkspaceShell>
  );
}

export function SurfaceState({ detail, kind, title }: { detail: string; kind: 'loading' | 'empty' | 'error' | 'forbidden'; title: string }) {
  return <div className="flex min-h-[42vh] max-w-2xl flex-col justify-center border-l border-os-rule-dark pl-6" data-surface-state={kind} role={kind === 'error' ? 'alert' : undefined}><p data-reading-role="caption" className="font-data uppercase tracking-[0.1em] text-os-vermilion">{kind}</p><h1 className="mt-3 font-editorial text-4xl font-normal text-os-paper sm:text-5xl">{title}</h1><p data-reading-role="body" className="mt-4 max-w-xl text-base leading-[var(--leading-body)] text-os-muted-dark">{detail}</p></div>;
}
