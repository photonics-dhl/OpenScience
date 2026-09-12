'use client';

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';

import { HermesAnchor } from '@/components/hermes/HermesAnchor';
import { useOptionalHermesWorkspaceStage } from '@/components/hermes/HermesWorkspaceStage';
import { hasExplicitMath, ScientificText } from '@/components/content/ScientificText';
import type { HermesAnchorId } from '@/lib/hermes/anchor-registry';
import type { SdfCore } from '../../lib/api';
import styles from './editor.module.css';

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

function ProseTextarea({ autoFocus = false, field, label, value, placeholder, onBlur, onChange, onFocus }: {
  autoFocus?: boolean;
  field: keyof Omit<SdfCore, 'schemaVersion'>;
  label: string;
  value: string;
  placeholder: string;
  onBlur?: () => void;
  onChange: (value: string) => void;
  onFocus: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const resize = () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    };
    resize();
    const observed = textarea.parentElement;
    let lastWidth = observed?.getBoundingClientRect().width ?? 0;
    const observer = observed && typeof ResizeObserver !== 'undefined' ? new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width;
      if (!nextWidth || nextWidth === lastWidth) return;
      lastWidth = nextWidth;
      resize();
    }) : null;
    if (observed && observer) observer.observe(observed);
    return () => observer?.disconnect();
  }, [value]);

  return (
    <textarea
      aria-label={label}
      autoFocus={autoFocus}
      className={styles.proseInput}
      data-reading-role="reading"
      id={`sdf-field-${field}`}
      onBlur={onBlur}
      onChange={(event) => onChange(event.target.value)}
      onFocus={onFocus}
      placeholder={placeholder}
      ref={textareaRef}
      rows={1}
      value={value}
    />
  );
}

export default function CoreEditor({ core, onEdit, activeField, onSelectField, sourceHref }: {
  core: SdfCore;
  onEdit: (field: keyof Omit<SdfCore, 'schemaVersion'>, value: string) => void;
  activeField: keyof Omit<SdfCore, 'schemaVersion'> | null;
  onSelectField: (field: keyof Omit<SdfCore, 'schemaVersion'>) => void;
  sourceHref?: string;
}) {
  const t = useTranslations('editor');
  const current = activeField ?? 'problem';
  const hermesStage = useOptionalHermesWorkspaceStage();
  const [editingField, setEditingField] = useState<keyof Omit<SdfCore, 'schemaVersion'> | null>(null);

  useEffect(() => {
    hermesStage?.requestGuide(HERMES_FIELD_ANCHORS[current]);
  }, [current, hermesStage]);

  return (
    <article aria-label={t('coreEdit')} className={styles.core} data-reading-role="body">
      <div className={styles.prose}>
        {FIELDS.map((field, index) => (
          <section className={styles.passage} data-active={current === field ? 'true' : undefined} data-sdf-node={index + 1} id={`research-section-${field}`} key={field}>
            <h2 className={styles.sectionHeading}>
              <span aria-hidden="true" className={styles.sectionMarker} />
              <label htmlFor={`sdf-field-${field}`}>{t(field)}</label>
              <span className={styles.sectionNumber}>{String(index + 1).padStart(2, '0')}</span>
            </h2>
            <HermesAnchor id={HERMES_FIELD_ANCHORS[field]}>
              {hasExplicitMath(core[field]) && editingField !== field ? (
                <ScientificText
                  aria-label={`${t(field)} · ${t('coreEdit')}`}
                  className={styles.mathSurface}
                  data-reading-role="reading"
                  data-sdf-math-display="true"
                  onClick={() => { setEditingField(field); onSelectField(field); }}
                  onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    setEditingField(field);
                    onSelectField(field);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  {core[field]}
                </ScientificText>
              ) : (
                <ProseTextarea
                  autoFocus={editingField === field}
                  field={field}
                  label={t(field)}
                  onBlur={() => setEditingField((editing) => editing === field ? null : editing)}
                  onChange={(value) => onEdit(field, value)}
                  onFocus={() => { setEditingField(field); onSelectField(field); }}
                  placeholder={t(`hints.${field}`)}
                  value={core[field]}
                />
              )}
            </HermesAnchor>
            {sourceHref && (field === 'insight' || field === 'results') ? (
              <a className={styles.sourceLink} href={sourceHref}>{t('savedVersionSources')}</a>
            ) : null}
          </section>
        ))}
      </div>
    </article>
  );
}
