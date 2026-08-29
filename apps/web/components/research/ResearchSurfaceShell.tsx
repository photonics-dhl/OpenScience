'use client';

import { useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { HermesAssistantDrawer } from '@/components/hermes/HermesAssistantDrawer';
import { HermesDockAnchor } from '@/components/hermes/HermesDockAnchor';
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
  const locale = useLocale() as 'zh' | 'en';
  const [hermesOpen, setHermesOpen] = useState(false);
  const fields = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'];
  const suggestion = {
    bodyKey: 'guide.continue.body',
    href: `/research-objects/${encodeURIComponent(object.id)}/edit`,
    kind: 'continue-research' as const,
    researchObjectId: object.id,
    titleKey: 'guide.continue.title',
  };
  return (
    <WorkspaceShell
      activeMobilePlane="main"
      leftRail={
        <div>
          <p data-reading-role="caption" className="text-os-muted-paper">{t('objectMap')}</p>
          <ol className="mt-5 space-y-3">
            {fields.map((field, index) => <li className="flex gap-3 text-sm text-os-muted-paper" key={field}><span className="font-data text-xs text-os-vermilion-ink">0{index + 1}</span><span>{t(`fields.${field}`)}</span></li>)}
          </ol>
        </div>
      }
      mainClassName="p-0 lg:p-0"
      navigationLabel={t('navigation')}
      objectHeader={<ObjectHeader actions={actions} objectId={object.id} saveState="saved" title={object.title} version={object.version} visibility={object.visibility} />}
      rightRail={<>
        {rail ?? <div><p data-reading-role="caption" className="text-os-muted-paper">{t('integrity')}</p><p className="mt-4 text-base leading-[var(--leading-body)] text-os-muted-paper">{t('integrityBody')}</p></div>}
        <div className="mt-8 border-t border-os-rule-paper pt-4">
          <HermesDockAnchor assistantOpen={hermesOpen} onInvoke={() => setHermesOpen(true)} state="idle" suggestion={suggestion} workspaceId={object.id} />
        </div>
        <HermesAssistantDrawer
          dashboardContext={{ tasks: [], researchObjects: [{ id: object.id, status: object.status, title: object.title }] }}
          locale={locale}
          onOpenChange={setHermesOpen}
          open={hermesOpen}
          route="research-object-edit"
          suggestion={suggestion}
          target={null}
        />
      </>}
      skipLabel={t('skip')}
      workspaceModes={<ResearchWorkspaceNav active={active} objectId={object.id} />}
    >
      <div className="min-h-[calc(100dvh-10.25rem)] px-4 py-7 sm:px-7 lg:px-10 lg:py-9">{children}</div>
    </WorkspaceShell>
  );
}

export function SurfaceState({ detail, kind, title }: { detail: string; kind: 'loading' | 'empty' | 'error' | 'forbidden'; title: string }) {
  return <div className="flex min-h-[42vh] max-w-2xl flex-col justify-center border-l-2 border-os-vermilion-ink pl-6" data-surface-state={kind} role={kind === 'error' ? 'alert' : undefined}><p data-reading-role="caption" className="text-os-vermilion-ink">{kind}</p><h1 className="mt-3 text-4xl font-normal text-os-ink">{title}</h1><p data-reading-role="body" className="mt-4 max-w-xl text-os-muted-paper">{detail}</p></div>;
}

export function ResearchSurfaceStateShell({ active, detail, kind, objectId, title }: {
  active: ResearchSurfaceId;
  detail: string;
  kind: 'loading' | 'empty' | 'error' | 'forbidden';
  objectId: string;
  title: string;
}) {
  const t = useTranslations('productSurfaces');
  return <WorkspaceShell
    leftRail={<div><p data-reading-role="caption" className="text-os-muted-paper">{t('objectMap')}</p><p className="mt-4 break-all font-data text-xs text-os-muted-paper">{objectId}</p></div>}
    navigationLabel={t('navigation')}
    objectHeader={<div className="min-w-0"><span data-reading-role="caption" className="text-os-muted-paper">Research Object</span><strong className="ml-3 truncate text-sm text-os-ink">{title}</strong></div>}
    rightRail={<p className="text-sm leading-6 text-os-muted-paper">{detail}</p>}
    skipLabel={t('skip')}
    workspaceModes={<ResearchWorkspaceNav active={active} objectId={objectId} />}
  >
    <SurfaceState detail={detail} kind={kind} title={title} />
  </WorkspaceShell>;
}
