'use client';

import { useTranslations } from 'next-intl';
import type { SdfCore } from '../../lib/api';
import VersionList from './VersionList';

const FIELD_ORDER: Array<keyof Omit<SdfCore, 'schemaVersion'>> = [
  'problem', 'insight', 'method', 'results', 'limitations', 'reproducibility',
];

export interface VersionLite {
  versionId: string;
  versionNo: number;
  status: string;
}

export default function OutlinePanel({
  core,
  activeField,
  onSelectField,
  versions,
  onSelectVersion,
  activeVersionId,
}: {
  core: SdfCore;
  activeField: keyof Omit<SdfCore, 'schemaVersion'> | null;
  onSelectField: (field: keyof Omit<SdfCore, 'schemaVersion'>) => void;
  versions: VersionLite[];
  onSelectVersion: (versionId: string) => void;
  activeVersionId?: string;
}) {
  const t = useTranslations('editor');
  const filled = FIELD_ORDER.filter((field) => core[field].trim().length > 0).length;

  return (
    <nav aria-label={t('outline')}>
      <div className="flex items-baseline justify-between border-b border-os-rule-dark pb-3">
        <h2 className="m-0 font-data text-xs uppercase tracking-[0.14em] text-os-paper">{t('outline')}</h2>
        <span className="font-data text-[10px] text-os-muted-dark">{filled}/{FIELD_ORDER.length}</span>
      </div>
      <ol className="m-0 list-none p-0">
        {FIELD_ORDER.map((field, index) => (
          <li className="border-b border-os-rule-dark" key={field}>
            <button
              className="flex min-h-12 w-full items-center gap-3 border-0 bg-transparent p-0 text-left text-sm text-os-muted-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              onClick={() => onSelectField(field)}
              type="button"
            >
              <span className="font-data text-[10px]">{String(index + 1).padStart(2, '0')}</span>
              <span className={activeField === field ? 'text-os-paper' : undefined}>{t(field)}</span>
              <span className={activeField === field ? 'ml-auto h-1.5 w-1.5 bg-os-vermilion' : 'ml-auto h-1.5 w-1.5 border border-os-rule-dark'} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
      <div className="mt-8 border-t border-os-rule-dark pt-4" id="versions">
        <VersionList versions={versions} onSelect={onSelectVersion} activeVersionId={activeVersionId} />
      </div>
    </nav>
  );
}
