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
    <div className="border-t border-white/20">
      {materials.map((material, index) => {
        const titleId = `material-${index}`;
        const locked = material.status !== 'local';
        return (
          <article className="grid gap-4 border-b border-white/15 py-5 lg:grid-cols-[minmax(0,1fr)_11rem_10rem]" data-material-row key={material.localId}>
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="truncate font-medium" id={titleId}>{material.file.name}</h3>
                  <p className="mt-1 text-xs text-white/45">{(material.file.size / 1024).toFixed(1)} KB · {t(`status.${material.status}`)}</p>
                </div>
                {!locked ? <button className="border-0 bg-transparent p-0 text-xs text-white/55 underline-offset-4 hover:text-white hover:underline" type="button" onClick={() => onRemove(material.localId)}>{t('remove')}</button> : null}
              </div>
              <div className="mt-4"><IngestionProgress progress={material.progress} status={material.status} /></div>
              {material.errorCode ? <p className="mt-3 text-xs text-[#ff9b86]" role="alert">{material.errorCode}</p> : null}
            </div>
            <MaterialRoleSelect labelledBy={titleId} onChange={(role) => onRoleChange(material.localId, role)} value={material.role} />
            <div className="flex items-center lg:justify-end">
              {material.status === 'failed_retryable' && material.taskId ? (
                <button className="border-x-0 border-t-0 border-b border-[#ef4c2f] bg-transparent p-0 pb-1 text-xs font-semibold uppercase tracking-[0.13em] text-[#ff8065]" type="button" onClick={() => onRetry(material)}>{t('retry')}</button>
              ) : material.role === 'manuscript' ? (
                <label className="flex cursor-pointer items-center gap-2 text-xs text-white/65">
                  <input checked={material.primary} disabled={locked || material.role !== 'manuscript'} name="primary-manuscript" type="radio" onChange={() => onPrimaryChange(material.localId)} />
                  {t('primary')}
                </label>
              ) : <span className="text-xs text-white/35">{t('supporting')}</span>}
            </div>
          </article>
        );
      })}
    </div>
  );
}
