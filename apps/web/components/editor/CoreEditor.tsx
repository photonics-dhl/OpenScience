'use client';

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';

import { HermesAnchor } from '@/components/hermes/HermesAnchor';
import { useOptionalHermesWorkspaceStage } from '@/components/hermes/HermesWorkspaceStageContext';
import { hasExplicitMath, ScientificText, withoutInternalSourceMarkers } from '@/components/content/ScientificText';
import { SdfFieldContent } from '@/components/content/SdfFieldContent';
import { canEditSdfCore } from '@/lib/editor-state';
import type { SdfField } from '@openscience/sdf-schema';
import type { HermesAnchorId } from '@/lib/hermes/anchor-registry';
import type { SdfCoreSnapshot } from '../../lib/api';
import styles from './editor.module.css';

const FIELDS: SdfField[] = [
  'problem', 'insight', 'method', 'results', 'limitations', 'reproducibility',
];
const HERMES_FIELD_ANCHORS: Record<SdfField, HermesAnchorId> = {
  problem: 'sdf-problem',
  insight: 'sdf-insight',
  method: 'sdf-method',
  results: 'sdf-results',
  limitations: 'sdf-limitations',
  reproducibility: 'sdf-evidence',
};

function ProseTextarea({ autoFocus = false, field, label, value, placeholder, onBlur, onChange, onFocus }: {
  autoFocus?: boolean;
  field: SdfField;
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

export default function CoreEditor({ core, onEdit, activeField, onSelectField, readOnly: requestedReadOnly = false, fields, headingLabels, readFirst = false, chapterNavigation = false }: {
  core: SdfCoreSnapshot;
  onEdit: (field: SdfField, value: string) => void;
  activeField: SdfField | null;
  onSelectField: (field: SdfField) => void;
  readOnly?: boolean;
  fields?: SdfField[];
  headingLabels?: Partial<Record<SdfField, string>>;
  readFirst?: boolean;
  chapterNavigation?: boolean;
}) {
  const t = useTranslations('editor');
  const readOnly = requestedReadOnly || !canEditSdfCore(core);
  const visibleFields = fields?.length ? fields : FIELDS;
  const current = activeField && visibleFields.includes(activeField)
    ? activeField
    : visibleFields[0] ?? 'problem';
  const hermesStage = useOptionalHermesWorkspaceStage();
  const [editingField, setEditingField] = useState<SdfField | null>(null);
  const showChapters = readFirst && chapterNavigation;
  const Heading = showChapters ? 'h3' : 'h2';
  const fieldLabel = (field: SdfField) => headingLabels?.[field] ?? t(readFirst ? `reading.fields.${field}` : field);

  function beginEditing(field: SdfField) {
    if (readOnly) return;
    setEditingField(field);
    onSelectField(field);
    window.requestAnimationFrame(() => document.getElementById(`sdf-field-${field}`)?.focus());
  }

  useEffect(() => {
    if (readFirst && readOnly) setEditingField(null);
  }, [readFirst, readOnly]);

  useEffect(() => {
    hermesStage?.requestGuide(HERMES_FIELD_ANCHORS[current]);
  }, [current, hermesStage]);

  return (
    <article aria-label={t('coreEdit')} className={`${styles.core}${readFirst ? ` ${styles.readingCore}` : ''}`} data-reading-role="body">
      {showChapters ? <header className={styles.readingHeader}>
        <h2>{t('reading.title')}</h2>
        <nav aria-label={t('reading.navigation')} className={styles.chapterNavigation}>
          {visibleFields.map((field) => <a
            aria-current={current === field ? 'location' : undefined}
            href={`#research-section-${field}`}
            key={field}
            onClick={() => {
              onSelectField(field);
              window.requestAnimationFrame(() => document.getElementById(`research-section-${field}`)?.focus({ preventScroll: true }));
            }}
          >{fieldLabel(field)}</a>)}
        </nav>
      </header> : null}
      <div className={styles.prose}>
        {visibleFields.map((field, index) => (
          <section className={styles.passage} data-active={current === field ? 'true' : undefined} data-sdf-node={index + 1} id={`research-section-${field}`} key={field} tabIndex={showChapters ? -1 : undefined}>
            {readFirst ? <div className={styles.readingSectionHeader}>
              <Heading>{fieldLabel(field)}</Heading>
              {!readOnly ? <button
                aria-label={`${fieldLabel(field)} · ${t('edit')}`}
                className={styles.readingEdit}
                type="button"
                onPointerDown={(event) => {
                  // Keep the current textarea in place until this click switches fields.
                  if (event.isPrimary && event.button === 0) event.preventDefault();
                }}
                onClick={() => beginEditing(field)}
              >{t('edit')}</button> : null}
            </div> : <h2 className={styles.sectionHeading}>
              <span aria-hidden="true" className={styles.sectionMarker} />
              {readOnly ? <span>{fieldLabel(field)}</span> : <button className={styles.sectionEdit} type="button" onClick={() => beginEditing(field)}>{fieldLabel(field)}</button>}
            </h2>}
            <HermesAnchor id={HERMES_FIELD_ANCHORS[field]}>
              {readOnly || (readFirst && editingField !== field) ? <SdfFieldContent core={core} field={field} fallback={t(`hints.${field}`)} className={styles.mathSurface} data-reading-role="reading" data-read-only={readOnly ? 'true' : undefined} /> : hasExplicitMath(core[field]) && editingField !== field ? (
                <ScientificText
                  hideSourceMarkers
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
                  label={readFirst ? fieldLabel(field) : t(field)}
                  onBlur={() => setEditingField((editing) => editing === field ? null : editing)}
                  onChange={(value) => onEdit(field, value)}
                  onFocus={() => { setEditingField(field); onSelectField(field); }}
                  placeholder={t(`hints.${field}`)}
                  value={withoutInternalSourceMarkers(core[field])}
                />
              )}
            </HermesAnchor>
          </section>
        ))}
      </div>
    </article>
  );
}
