'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslations } from 'next-intl';
import type { SdfCore } from '../../lib/api';

const FIELDS: Array<{ key: keyof Omit<SdfCore, 'schemaVersion'>; hint: string }> = [
  { key: 'problem', hint: '描述研究的核心科学或技术问题' },
  { key: 'insight', hint: '核心洞见与创新点' },
  { key: 'method', hint: '研究方法与实验设计' },
  { key: 'results', hint: '研究结果与发现' },
  { key: 'limitations', hint: '局限性与边界条件' },
  { key: 'reproducibility', hint: '可复现性与代码/数据' },
];

/** 中栏：Markdown 六字段编辑（§5.4，textarea + 预览切换）。 */
export default function CoreEditor({
  core,
  onEdit,
  activeField,
}: {
  core: SdfCore;
  onEdit: (field: keyof Omit<SdfCore, 'schemaVersion'>, value: string) => void;
  activeField: keyof Omit<SdfCore, 'schemaVersion'> | null;
}) {
  const t = useTranslations('editor');
  const [preview, setPreview] = useState(false);

  const current = activeField ?? 'problem';
  const field = FIELDS.find((f) => f.key === current)!;

  return (
    <div>
      <div className="toolbar-inline">
        <span className="field-label">{t(field.key)}</span>
        <span className="pane-meta">{field.hint}</span>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={() => setPreview(!preview)}>
          {preview ? t('edit') : t('preview')}
        </button>
      </div>
      {preview ? (
        <div className="md-preview">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{core[current]}</ReactMarkdown>
        </div>
      ) : (
        <textarea
          className="field-textarea"
          value={core[current]}
          onChange={(e) => onEdit(current, e.target.value)}
          placeholder={field.hint}
          aria-label={t(field.key)}
        />
      )}
    </div>
  );
}
