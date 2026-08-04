'use client';

import { useTranslations } from 'next-intl';
import type { SdfCore } from '../../lib/api';

const FIELD_ORDER: Array<keyof Omit<SdfCore, 'schemaVersion'>> = [
  'problem', 'insight', 'method', 'results', 'limitations', 'reproducibility',
];

export interface VersionLite {
  versionId: string;
  versionNo: number;
  status: string;
}

/** 左栏：章节大纲（六字段锚点）+ 版本导航（P1B-4 消费）。 */
export default function OutlinePanel({
  core,
  activeField,
  onSelectField,
  versions,
  onSelectVersion,
}: {
  core: SdfCore;
  activeField: keyof Omit<SdfCore, 'schemaVersion'> | null;
  onSelectField: (field: keyof Omit<SdfCore, 'schemaVersion'>) => void;
  versions: VersionLite[];
  onSelectVersion: (versionId: string) => void;
}) {
  const t = useTranslations('editor');
  const filled = FIELD_ORDER.filter((f) => core[f].trim().length > 0).length;

  return (
    <div>
      <h3 className="pane-title">{t('outline')}</h3>
      <p className="pane-meta">{filled}/{FIELD_ORDER.length} 字段已填写</p>
      {FIELD_ORDER.map((f) => (
        <div
          key={f}
          className={`outline-item ${activeField === f ? 'active' : ''}`}
          onClick={() => onSelectField(f)}
        >
          {t(f)}
        </div>
      ))}
      <h3 className="pane-title" style={{ marginTop: 24 }}>{t('versions')}</h3>
      {versions.map((v) => (
        <div key={v.versionId} className="version-item" onClick={() => onSelectVersion(v.versionId)}>
          v{v.versionNo} · {v.status}
        </div>
      ))}
    </div>
  );
}
