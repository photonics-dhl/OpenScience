'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslations } from 'next-intl';

import { SDFNode } from '@/components/research/SDFNode';
import { HermesAnchor } from '@/components/hermes/HermesAnchor';
import { useOptionalHermesWorkspaceStage } from '@/components/hermes/HermesWorkspaceStage';
import type { HermesAnchorId } from '@/lib/hermes/anchor-registry';
import type { SdfCore } from '../../lib/api';

const FIELDS: Array<keyof Omit<SdfCore, 'schemaVersion'>> = [
  'problem', 'insight', 'method', 'results', 'limitations', 'reproducibility',
];
const HERMES_FIELD_ANCHORS: Record<keyof Omit<SdfCore, 'schemaVersion'>, HermesAnchorId> = {
  problem: 'sdf-problem',
  insight: 'sdf-insight',
  method: 'sdf-method',
  results: 'sdf-results',
  limitations: 'sdf-limitations',
  reproducibility: 'sdf-evidence',
};

export default function CoreEditor({
  core,
  onEdit,
  activeField,
  onSelectField,
}: {
  core: SdfCore;
  onEdit: (field: keyof Omit<SdfCore, 'schemaVersion'>, value: string) => void;
  activeField: keyof Omit<SdfCore, 'schemaVersion'> | null;
  onSelectField: (field: keyof Omit<SdfCore, 'schemaVersion'>) => void;
}) {
  const t = useTranslations('editor');
  const [preview, setPreview] = useState(false);
  const current = activeField ?? 'problem';
  const hermesStage = useOptionalHermesWorkspaceStage();

  useEffect(() => {
    hermesStage?.requestGuide(HERMES_FIELD_ANCHORS[current]);
  }, [current, hermesStage]);

  return (
    <div data-reading-role="body">
      <div className="flex items-end justify-between border-b border-os-rule-dark pb-4">
        <div>
          <p data-reading-role="caption" className="m-0 font-data uppercase tracking-[0.1em] text-os-muted-dark">{t('sdfCoreLabel')}</p>
          <h1 className="mb-0 mt-2 font-editorial text-4xl font-normal tracking-[-0.04em] text-os-paper">{t('coreEdit')}</h1>
        </div>
        <button data-reading-role="control" className="min-h-10 rounded-panel border border-os-rule-dark bg-transparent px-3 text-sm text-os-paper" onClick={() => setPreview(!preview)}>
          {preview ? t('edit') : t('preview')}
        </button>
      </div>
      {FIELDS.map((field, index) => (
        <SDFNode
          active={current === field}
          hint={t(`hints.${field}`)}
          key={field}
          label={t(field)}
          number={index + 1}
          onActivate={() => onSelectField(field)}
        >
          {preview ? (
            <div data-reading-role="reading" className="surface-evidence min-h-36 p-5 text-[1.0625rem] leading-[var(--leading-reading)]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{core[field]}</ReactMarkdown>
            </div>
          ) : (
            <HermesAnchor id={HERMES_FIELD_ANCHORS[field]}>
              <textarea
                data-reading-role="reading"
                className="min-h-48 w-full resize-y border border-os-rule-dark bg-os-black-1 p-4 font-editorial text-lg leading-8 text-os-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                value={core[field]}
                onChange={(event) => onEdit(field, event.target.value)}
                placeholder={t(`hints.${field}`)}
                aria-label={t(field)}
              />
            </HermesAnchor>
          )}
        </SDFNode>
      ))}
    </div>
  );
}
