'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Children, type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';

import { ScientificText } from '@/components/content/ScientificText';
import type { SourceLocator, WorkspaceGuideResult } from '@/lib/api';

import styles from './HermesWritingDraft.module.css';

export type HermesWritingDraftValue = NonNullable<WorkspaceGuideResult['writingDraft']>;

function normalizeMathOutsideCode(markdown: string) {
  let fence = '';
  return markdown.split('\n').map((line) => {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/u);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fence) fence = marker;
      else if (fence === marker) fence = '';
      return line;
    }
    if (fence) return line;
    let inlineFence = '';
    let output = '';
    for (let index = 0; index < line.length;) {
      if (line[index] === '`') {
        let end = index + 1;
        while (line[end] === '`') end += 1;
        const marker = line.slice(index, end);
        if (!inlineFence) inlineFence = marker;
        else if (inlineFence === marker) inlineFence = '';
        output += marker;
        index = end;
        continue;
      }
      const pair = line.slice(index, index + 2);
      if (!inlineFence && ['\\(', '\\)', '\\[', '\\]'].includes(pair)) {
        output += pair === '\\[' || pair === '\\]' ? '$$' : '$';
        index += 2;
        continue;
      }
      output += line[index];
      index += 1;
    }
    return output;
  }).join('\n');
}

function ScientificChildren({ children, budget }: { children: ReactNode; budget: { expressions: number; text: number } }) {
  return Children.map(children, (child, index) => {
    if (typeof child === 'string') {
      const expressions = Math.floor((child.match(/\$/gu)?.length ?? 0) / 2);
      if (expressions && (budget.expressions + expressions > 64 || budget.text + child.length > 16_000)) return child;
      budget.expressions += expressions;
      if (expressions) budget.text += child.length;
      return <ScientificText as="span" key={index}>{child}</ScientificText>;
    }
    return child;
  });
}

function safeMarkdownUrl(url: string) {
  const value = url.trim();
  return value.startsWith('#') || /^(?:https?:|mailto:)/iu.test(value) ? value : '';
}

function downloadableMarkdown(draft: HermesWritingDraftValue, sourcesHeading: string, locator: (source: SourceLocator) => string) {
  const citations = draft.citations.filter((citation) => draft.body.includes(citation.marker));
  const sources = citations.length
    ? `\n\n## ${sourcesHeading}\n\n${citations.map((citation) => `- ${citation.marker} ${citation.quote.replace(/\n/gu, '\n  ')}\n  - ${locator(citation.sourceLocator)}`).join('\n')}`
    : '';
  return `# ${draft.title.replace(/\r?\n/gu, ' ')}\n\n${draft.body.trim()}${sources}\n`;
}

function MarkdownBody({ body }: { body: string }) {
  const mathBudget = { expressions: 0, text: 0 };
  return <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    skipHtml
    urlTransform={safeMarkdownUrl}
    components={{
      img: () => null,
      a: ({ href, children }) => href && safeMarkdownUrl(href) ? <a href={href} rel="noreferrer noopener" target="_blank"><ScientificChildren budget={mathBudget}>{children}</ScientificChildren></a> : <span><ScientificChildren budget={mathBudget}>{children}</ScientificChildren></span>,
      p: ({ children }) => <p><ScientificChildren budget={mathBudget}>{children}</ScientificChildren></p>,
      h1: ({ children }) => <h1><ScientificChildren budget={mathBudget}>{children}</ScientificChildren></h1>,
      h2: ({ children }) => <h2><ScientificChildren budget={mathBudget}>{children}</ScientificChildren></h2>,
      h3: ({ children }) => <h3><ScientificChildren budget={mathBudget}>{children}</ScientificChildren></h3>,
      h4: ({ children }) => <h4><ScientificChildren budget={mathBudget}>{children}</ScientificChildren></h4>,
      li: ({ children }) => <li><ScientificChildren budget={mathBudget}>{children}</ScientificChildren></li>,
      blockquote: ({ children }) => <blockquote><ScientificChildren budget={mathBudget}>{children}</ScientificChildren></blockquote>,
      strong: ({ children }) => <strong><ScientificChildren budget={mathBudget}>{children}</ScientificChildren></strong>,
      em: ({ children }) => <em><ScientificChildren budget={mathBudget}>{children}</ScientificChildren></em>,
    }}
  >{normalizeMathOutsideCode(body)}</ReactMarkdown>;
}

export function HermesWritingDraft({
  draft,
  draftTaskId,
  dirty,
  disabled,
  onChange,
  onSave,
}: {
  draft: HermesWritingDraftValue;
  draftTaskId: string;
  dirty: boolean;
  disabled?: boolean;
  onChange(next: HermesWritingDraftValue): void;
  onSave(): void;
}) {
  const t = useTranslations('hermesConversation.writing');
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { setEditing(false); }, [draftTaskId]);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    else if (!open && node.open) node.close();
  }, [open]);

  const formatLocator = (locator: SourceLocator) => {
    const parts: string[] = [];
    if (locator.page !== undefined) parts.push(t('page', { page: locator.page }));
    if (locator.blockId) parts.push(t('block', { block: locator.blockId }));
    if (locator.charRange) parts.push(t('characters', { start: locator.charRange.start, end: locator.charRange.end }));
    if (locator.tableCell) parts.push(t('tableCell', { sheet: locator.tableCell.sheet || t('table'), row: locator.tableCell.row, column: locator.tableCell.column }));
    if (locator.codeRange) parts.push(t('codeRange', { path: locator.codeRange.path, start: locator.codeRange.startLine, end: locator.codeRange.endLine }));
    return parts.length ? parts.join(' · ') : t('artifact', { artifact: locator.artifactId });
  };

  const download = () => {
    const blob = new Blob([downloadableMarkdown(draft, t('sources'), formatLocator)], { type: 'text/markdown;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `${draft.title.replace(/[\\/:*?"<>|]+/gu, '-').trim().slice(0, 80) || 'hermes-draft'}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1_000);
  };

  const kind = t(`kind.${draft.kind}`);
  const status = dirty ? t('localChanges') : t(`status.${draft.sourceStatus}`);
  const activeCitations = draft.citations.filter((citation) => draft.body.includes(citation.marker));

  const actions = <div className={styles.actions}>
    {editing ? <button className={styles.button} type="button" onClick={() => setEditing(false)}>{t('done')}</button>
      : <button className={styles.button} type="button" disabled={disabled} onClick={() => setEditing(true)}>{t('edit')}</button>}
    <button className={styles.button} type="button" onClick={download}>{t('download')}</button>
    {dirty ? <button className={`${styles.button} ${styles.primary}`} type="button" disabled={disabled || !draft.title.trim()} onClick={() => { onSave(); setOpen(false); }}>{t('save')}</button> : null}
  </div>;

  const sourceList = activeCitations.length ? <details className={styles.sources}>
    <summary>{t('sourcesCount', { count: activeCitations.length })}</summary>
    <ol className={styles.sourceList}>
      {activeCitations.map((citation) => <li className={styles.source} key={citation.id}>
        <span className={styles.marker}>{citation.marker}</span>
        <blockquote className={styles.quote}>{citation.quote}</blockquote>
        <p className={styles.locator}>{formatLocator(citation.sourceLocator)}</p>
      </li>)}
    </ol>
  </details> : null;

  return <article className={styles.draft} aria-labelledby={`writing-draft-${draftTaskId}`}>
    <header className={styles.header}>
      <div>
        <p className={styles.eyebrow}>{kind}</p>
        <h3 className={styles.title} id={`writing-draft-${draftTaskId}`}>{draft.title}</h3>
        <p className={styles.status} role="status">{status}</p>
      </div>
      <div className={styles.actions}>
        <button className={`${styles.button} ${styles.primary}`} type="button" onClick={() => setOpen(true)}>{t('open')}</button>
      </div>
    </header>
    {typeof document !== 'undefined' ? createPortal(<dialog ref={dialog} className={styles.dialog} aria-label={t('dialogLabel')}
      onCancel={(event) => { event.preventDefault(); setOpen(false); }} onClose={() => setOpen(false)}>
      <div className={styles.dialogShell}>
        <header className={styles.dialogHeader}>
          <div>
            <p className={styles.eyebrow}>{kind}</p>
            <h2 className={styles.dialogTitle}>{draft.title}</h2>
            <p className={styles.status} role="status">{status}</p>
          </div>
          <button className={styles.close} type="button" onClick={() => setOpen(false)} aria-label={t('close')}>×</button>
        </header>
        <div className={styles.dialogTools}>{actions}</div>
        <div className={styles.readingPane}>
          {editing ? <div className={styles.editorWrap}>
            <label className="sr-only" htmlFor={`writing-title-${draftTaskId}`}>{t('titleLabel')}</label>
            <input id={`writing-title-${draftTaskId}`} className={styles.titleInput} disabled={disabled} maxLength={240} value={draft.title}
              onChange={(event) => onChange({ ...draft, title: event.target.value })} />
            <label className="sr-only" htmlFor={`writing-body-${draftTaskId}`}>{t('bodyLabel')}</label>
            <textarea id={`writing-body-${draftTaskId}`} className={styles.editor} disabled={disabled} maxLength={60_000} value={draft.body}
              onChange={(event) => onChange({ ...draft, body: event.target.value })} />
            <p className={styles.editNote}>{t('editNote')}</p>
          </div> : <div className={styles.body}><MarkdownBody body={draft.body} /></div>}
          {sourceList}
        </div>
      </div>
    </dialog>, document.body) : null}
  </article>;
}
