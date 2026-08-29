'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';

import { IngestionProgress } from './IngestionProgress';
import type { IntakeMaterial, MaterialRole } from './intake-model';
import { MaterialRoleSelect } from './MaterialRoleSelect';

export function MaterialQueue({ materials, onRoleChange, onPrimaryChange, onRemove, onRetry }: {
  materials: IntakeMaterial[];
  onRoleChange: (localId: string, role: MaterialRole) => void;
  onPrimaryChange: (localId: string | null) => void;
  onRemove: (localId: string) => void;
  onRetry: (material: IntakeMaterial) => void;
}) {
  const t = useTranslations('ingestion.intake');
  return (
    <div className="border-t border-os-rule-paper">
      {materials.map((material, index) => {
        const titleId = `material-${index}`;
        const locked = material.status !== 'local';
        return (
          <article className="grid gap-4 border-b border-os-rule-paper py-5 lg:grid-cols-[minmax(0,1fr)_11rem_10rem]" data-material-row key={material.localId}>
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="truncate font-medium" id={titleId}>{material.file.name}</h3>
                  <p className="mt-1 text-sm text-os-muted-paper">{(material.file.size / 1024).toFixed(1)} KB · {t(`status.${material.status}`)}</p>
                </div>
                {!locked ? <button className="border-0 bg-transparent p-0 text-sm text-os-muted-paper underline-offset-4 hover:text-os-ink hover:underline" type="button" onClick={() => onRemove(material.localId)}>{t('remove')}</button> : null}
              </div>
              <div className="mt-4"><IngestionProgress progress={material.progress} status={material.status} /></div>
              {material.errorCode ? <p className="mt-3 text-sm text-state-danger" role="alert">{material.errorCode}</p> : null}
            </div>
            <MaterialRoleSelect labelledBy={titleId} onChange={(role) => onRoleChange(material.localId, role)} value={material.role} />
            <div className="flex items-center lg:justify-end">
              {material.status === 'failed_retryable' && material.taskId ? (
                <button className="border-x-0 border-t-0 border-b border-os-vermilion-ink bg-transparent p-0 pb-1 text-sm font-semibold text-os-vermilion-ink" type="button" onClick={() => onRetry(material)}>{t('retry')}</button>
              ) : material.role === 'manuscript' ? (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-os-muted-paper">
                  <input checked={material.primary} disabled={locked || material.role !== 'manuscript'} name="primary-manuscript" type="radio" onChange={() => onPrimaryChange(material.localId)} />
                  {t('primary')}
                </label>
              ) : <span className="text-sm text-os-muted-paper">{t('supporting')}</span>}
            </div>
          </article>
        );
      })}
    </div>
  );
}
