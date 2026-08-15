'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslations } from 'next-intl';

import { SDFNode } from '@/components/research/SDFNode';
import type { SdfCore } from '../../lib/api';

const FIELDS: Array<keyof Omit<SdfCore, 'schemaVersion'>> = [
  'problem', 'insight', 'method', 'results', 'limitations', 'reproducibility',
];

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

  return (
    <div>
      <div className="flex items-end justify-between border-b border-os-rule-dark pb-4">
        <div>
          <p className="m-0 font-data text-[10px] uppercase tracking-[0.15em] text-os-muted-dark">{t('sdfCoreLabel')}</p>
          <h1 className="mb-0 mt-2 font-editorial text-4xl font-normal tracking-[-0.04em] text-os-paper">{t('coreEdit')}</h1>
        </div>
        <button className="min-h-10 rounded-panel border border-os-rule-dark bg-transparent px-3 text-sm text-os-paper" onClick={() => setPreview(!preview)}>
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
            <div className="surface-evidence min-h-36 p-5 text-sm leading-7">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{core[field]}</ReactMarkdown>
            </div>
          ) : (
            <textarea
              className="min-h-48 w-full resize-y border border-os-rule-dark bg-os-black-1 p-4 font-editorial text-lg leading-8 text-os-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              value={core[field]}
              onChange={(event) => onEdit(field, event.target.value)}
              placeholder={t(`hints.${field}`)}
              aria-label={t(field)}
            />
          )}
        </SDFNode>
      ))}
    </div>
  );
}
