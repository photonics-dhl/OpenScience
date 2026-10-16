'use client';

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';

import { HermesAnchor } from '@/components/hermes/HermesAnchor';
import { useOptionalHermesWorkspaceStage } from '@/components/hermes/HermesWorkspaceStageContext';
import { hasExplicitMath, ScientificText, withoutInternalSourceMarkers, prepareScientificMarkdownSelection, scientificDisplaySelection } from '@/components/content/ScientificText';
import { SdfFieldContent } from '@/components/content/SdfFieldContent';
import { canEditSdfCore, sdfFieldFormat, sameSdfRepresentation, withSdfField } from '@/lib/editor-state';
import type { SdfField, SdfFieldFormat } from '@openscience/sdf-schema';
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

function ProseTextarea({ autoFocus = false, field, label, value, format, snapshot, onRestoreCore, placeholder, onBlur, onChange, onFocus }: {
  autoFocus?: boolean;
  field: SdfField;
  label: string;
  value: string;
  format: SdfFieldFormat;
  snapshot: SdfCoreSnapshot;
  onRestoreCore?: (core: SdfCoreSnapshot) => void;
  placeholder: string;
  onBlur?: () => void;
  onChange: (value: string, format?: SdfFieldFormat) => void;
  onFocus: () => void;
}) {
  const t = useTranslations('editor.format');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selection = useRef({ start: 0, end: 0 });
  const [selected, setSelected] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [feedback, setFeedback] = useState('');
  const history = useRef<Array<{ before: SdfCoreSnapshot; after: SdfCoreSnapshot; selection: { start: number; end: number } }>>([]);
  const readSelection = () => {
    const input = textareaRef.current;
    if (!input) return;
    selection.current = { start: input.selectionStart, end: input.selectionEnd };
    setSelected(input.selectionStart !== input.selectionEnd);
  };
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const resize = () => { textarea.style.height = 'auto'; textarea.style.height = `${textarea.scrollHeight}px`; };
    resize();
    const observed = textarea.parentElement;
    let lastWidth = observed?.getBoundingClientRect().width ?? 0;
    const observer = observed && typeof ResizeObserver !== 'undefined' ? new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width;
      if (!nextWidth || nextWidth === lastWidth) return;
      lastWidth = nextWidth; resize();
    }) : null;
    if (observed && observer) observer.observe(observed);
    return () => observer?.disconnect();
  }, [value]);
  function apply(operation: 'bold' | 'italic' | 'list' | 'link') {
    const chosen = prepareScientificMarkdownSelection(snapshot[field], selection.current.start, selection.current.end, format === 'markdown', true);
    if (!chosen) { setFeedback(t('selectProse')); return; }
    const safeUrl = url.trim();
    if (operation === 'link' && !(safeUrl.startsWith('#') || /^(?:https?:|mailto:)/iu.test(safeUrl))) { setFeedback(t('invalidUrl')); return; }
    let { start, end } = chosen;
    let replacement = chosen.value.slice(start, end);
    const selectedLength = replacement.length;
    let cursorOffset = 0;
    if (operation === 'list') {
      start = chosen.value.lastIndexOf('\n', start - 1) + 1;
      const nextLine = chosen.value.indexOf('\n', end);
      end = nextLine < 0 ? chosen.value.length : nextLine;
      replacement = chosen.value.slice(start, end).split('\n').map(line => `- ${line}`).join('\n');
    } else {
      const marker = operation === 'bold' ? '**' : operation === 'italic' ? '*' : '[';
      const suffix = operation === 'link' ? `](<${safeUrl.replace(/[<>\s]/gu, character => encodeURIComponent(character))}>)` : marker;
      replacement = marker + replacement + suffix;
      cursorOffset = marker.length;
    }
    const changed = chosen.value.slice(0, start) + replacement + chosen.value.slice(end);
    history.current.push({ before: snapshot, after: withSdfField(snapshot, field, changed, 'markdown'), selection: { ...selection.current } });
    onChange(changed, 'markdown');
    setFeedback(''); setLinkOpen(false);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      const nextSelection = scientificDisplaySelection(changed, start + cursorOffset, operation === 'list' ? start + replacement.length : start + cursorOffset + selectedLength);
      textareaRef.current?.setSelectionRange(nextSelection.start, nextSelection.end);
      readSelection();
    });
  }
  function undoFormat() {
    const prior = history.current.pop();
    if (!prior || !onRestoreCore) return;
    if (!sameSdfRepresentation(snapshot, prior.after)) { setFeedback(t('changed')); return; }
    onRestoreCore(prior.before);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(prior.selection.start, prior.selection.end);
      readSelection();
    });
  }
  return <div className={styles.proseEditor} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onBlur?.();
  }}>
    {onRestoreCore ? <div aria-label={t('toolbar')} className={styles.formatToolbar} role="group">
      {(['bold', 'italic', 'list', 'link'] as const).map(operation => <button key={operation} type="button"
        aria-label={t(operation)} disabled={!selected}
        onPointerDown={event => { if (event.isPrimary && event.button === 0) event.preventDefault(); }}
        onClick={() => operation === 'link' ? setLinkOpen(open => !open) : apply(operation)}
      >{operation === 'bold' ? <strong>B</strong> : operation === 'italic' ? <em>I</em> : operation === 'list' ? '☷' : '↗'}</button>)}
      <button type="button" disabled={!history.current.length || !onRestoreCore} onPointerDown={event => { if (event.isPrimary && event.button === 0) event.preventDefault(); }} onClick={undoFormat}>{t('undo')}</button>
    </div> : null}
    {linkOpen ? <div className={styles.linkEditor}>
      <label>{t('url')}<input autoFocus type="url" value={url} onChange={event => setUrl(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); apply('link'); } if (event.key === 'Escape') { setLinkOpen(false); textareaRef.current?.focus(); } }} /></label>
      <button type="button" onClick={() => apply('link')}>{t('insert')}</button>
    </div> : null}
    <textarea aria-label={label} autoFocus={autoFocus} className={styles.proseInput} data-reading-role="reading"
      id={`sdf-field-${field}`} ref={textareaRef} rows={1} value={value} placeholder={placeholder}
      onSelect={readSelection} onFocus={onFocus} onChange={event => { history.current = []; onChange(event.target.value); readSelection(); }}
      onKeyDown={event => {
        if (!onRestoreCore || !(event.ctrlKey || event.metaKey)) return;
        const key = event.key.toLowerCase();
        if (key === 'b' || key === 'i' || key === 'k') {
          event.preventDefault(); readSelection();
          if (key === 'k') setLinkOpen(true); else apply(key === 'b' ? 'bold' : 'italic');
        } else if (key === 'z' && !event.shiftKey && history.current.length) { event.preventDefault(); undoFormat(); }
      }} />
    {feedback ? <p role="status">{feedback}</p> : null}
  </div>;
}

export default function CoreEditor({ core, onEdit, onRestoreCore, activeField, onSelectField, readOnly: requestedReadOnly = false, fields, headingLabels, readFirst = false, chapterNavigation = false }: {
  core: SdfCoreSnapshot;
  onRestoreCore?: (core: SdfCoreSnapshot) => void;
  onEdit: (field: SdfField, value: string, format?: SdfFieldFormat) => void;
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
                  format={sdfFieldFormat(core, field)}
                  snapshot={core}
                  onRestoreCore={onRestoreCore}
                  label={readFirst ? fieldLabel(field) : t(field)}
                  onBlur={() => setEditingField((editing) => editing === field ? null : editing)}
                  onChange={(value, format) => onEdit(field, value, format)}
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
