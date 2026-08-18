'use client';

import * as React from 'react';
import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { MaterialQueue } from './MaterialQueue';
import { createIntakeMaterials, setPrimaryMaterial, type IntakeMaterial, type MaterialRole } from './intake-model';

export const EVIDENCE_ACCEPT = '.pdf,.doc,.docx,.tex,.zip,.md,.markdown,.png,.jpg,.jpeg,.webp,.svg,.csv,.tsv,.json,.yaml,.yml,.ipynb,.py,.r';

export function EvidenceIntake({ materials, onChange, onRetry }: {
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
      <div className="flex items-end justify-between gap-5 border-b border-white/25 pb-4">
        <div>
          <p data-reading-role="caption" className="uppercase tracking-[0.1em] text-[#ff7457]">02 / Evidence intake</p>
          <h2 className="mt-2 font-display text-2xl" id="evidence-intake-title">{t('title')}</h2>
        </div>
        <p className="hidden max-w-sm text-right text-xs leading-5 text-white/45 sm:block">{t('localOnly')}</p>
      </div>
      <div
        className={`mt-6 flex min-h-36 items-center justify-center border border-dashed px-6 text-center transition-colors motion-reduce:transition-none ${dragging ? 'border-[#ef4c2f] bg-[#ef4c2f]/[.07]' : 'border-white/25 bg-white/[.025]'}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); setDragging(false); add(Array.from(event.dataTransfer.files)); }}
      >
        <div>
          <p className="font-medium">{t('dropTitle')}</p>
          <p className="mt-2 text-xs leading-5 text-white/45">{t('formats')}</p>
          <button data-reading-role="control" className="mt-4 border-x-0 border-t-0 border-b border-[#ef4c2f] bg-transparent p-0 pb-1 text-sm font-semibold tracking-[0.04em] text-[#ff8065]" type="button" onClick={() => input.current?.click()}>{t('browse')}</button>
          <input ref={input} aria-label={t('browse')} className="sr-only" type="file" multiple accept={EVIDENCE_ACCEPT} onChange={(event) => add(Array.from(event.target.files ?? []))} />
        </div>
      </div>
      {materials.length > 0 ? (
        <div className="mt-8">
          <MaterialQueue
            materials={materials}
            onPrimaryChange={(localId) => onChange(setPrimaryMaterial(materials, localId))}
            onRemove={(localId) => onChange(materials.filter((material) => material.localId !== localId))}
            onRetry={onRetry}
            onRoleChange={setRole}
          />
          {materials.some(({ primary }) => primary) ? <button data-reading-role="control" className="mt-4 border-0 bg-transparent p-0 text-sm text-white/60 hover:text-white" type="button" onClick={() => onChange(setPrimaryMaterial(materials, null))}>{t('clearPrimary')}</button> : null}
        </div>
      ) : null}
    </section>
  );
}
