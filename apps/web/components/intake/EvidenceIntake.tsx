'use client';

import * as React from 'react';
import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { LiteratureAcquisitionDisclosure, type LiteratureAcquisitionProps } from '@/components/dashboard/LiteratureAcquisition';

import { MaterialQueue } from './MaterialQueue';
import { createIntakeMaterials, setPrimaryMaterial, type IntakeMaterial, type MaterialRole } from './intake-model';

const EVIDENCE_ACCEPT = '.pdf,.doc,.docx,.tex,.zip,.md,.markdown,.png,.jpg,.jpeg,.webp,.svg,.csv,.tsv,.json,.yaml,.yml,.ipynb,.py,.r';

export function EvidenceIntake({ literature, materials, onChange, onRetry }: {
  literature?: LiteratureAcquisitionProps;
  materials: IntakeMaterial[];
  onChange: (materials: IntakeMaterial[]) => void;
  onRetry: (material: IntakeMaterial) => void;
}) {
  const t = useTranslations('ingestion.intake');
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function add(files: File[]) {
    if (files.length === 0) return;
    const additions = createIntakeMaterials(files).map((row, index) => ({ ...row, localId: `${row.localId}:${materials.length + index}` }));
    onChange([...materials, ...additions]);
  }

  function setRole(localId: string, role: MaterialRole) {
    onChange(materials.map((material) => material.localId === localId ? { ...material, role, primary: role === 'manuscript' && material.primary } : material));
  }

  return (
    <section aria-labelledby="evidence-intake-title">
      <div className="flex items-end justify-between gap-5 border-b border-os-rule-paper pb-4">
        <div>
          <p data-reading-role="caption" className="text-os-vermilion-ink">{t('stepLabel')}</p>
          <h2 className="mt-2 text-2xl font-normal text-os-ink" id="evidence-intake-title">{t('title')}</h2>
        </div>
        <p className="hidden max-w-sm text-right text-sm leading-5 text-os-muted-paper sm:block">{t('localOnly')}</p>
      </div>
      <div
        className={`mt-6 flex min-h-36 items-center justify-center border border-dashed px-6 text-center transition-colors motion-reduce:transition-none ${dragging ? 'border-os-vermilion-ink bg-[#b83b22]/[.06]' : 'border-os-rule-paper bg-os-paper'}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); setDragging(false); add(Array.from(event.dataTransfer.files)); }}
      >
        <div>
          <p className="font-medium">{t('dropTitle')}</p>
          <p className="mt-2 text-sm leading-5 text-os-muted-paper">{t('formats')}</p>
          <button data-reading-role="control" className="mt-4 border-x-0 border-t-0 border-b border-os-vermilion-ink bg-transparent p-0 pb-1 text-sm font-semibold text-os-vermilion-ink" type="button" onClick={() => input.current?.click()}>{t('browse')}</button>
          <input ref={input} aria-label={t('browse')} className="sr-only" type="file" multiple accept={EVIDENCE_ACCEPT} onChange={(event) => add(Array.from(event.target.files ?? []))} />
        </div>
      </div>
      {literature ? <div className="mt-6"><LiteratureAcquisitionDisclosure {...literature} /></div> : null}
      {materials.length > 0 ? (
        <div className="mt-8">
          <MaterialQueue
            materials={materials}
            onPrimaryChange={(localId) => onChange(setPrimaryMaterial(materials, localId))}
            onRemove={(localId) => onChange(materials.filter((material) => material.localId !== localId))}
            onRetry={onRetry}
            onRoleChange={setRole}
          />
          {materials.some(({ primary }) => primary) ? <button data-reading-role="control" className="mt-4 border-0 bg-transparent p-0 text-sm text-os-muted-paper hover:text-os-ink" type="button" onClick={() => onChange(setPrimaryMaterial(materials, null))}>{t('clearPrimary')}</button> : null}
        </div>
      ) : null}
    </section>
  );
}
