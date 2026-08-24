'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export interface BeforeAfterProposalProps {
  after: string;
  before: string;
  onDismiss?: () => void;
  onReview: (value: string) => void;
  risk?: 'normal' | 'high';
  scope: string;
  source: string;
  status?: 'pending' | 'applied' | 'dismissed';
  evidenceQuote?: string;
  evidenceLocator?: string;
}

function BeforeAfterProposal({
  after,
  before,
  onDismiss,
  onReview,
  risk = 'normal',
  scope,
  source,
  status = 'pending',
  evidenceQuote,
  evidenceLocator,
}: BeforeAfterProposalProps) {
  const [reviewing, setReviewing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reviewValue, setReviewValue] = useState(after);
  const highRiskTriggerRef = useRef<HTMLButtonElement>(null);
  const t = useTranslations('editor');

  useEffect(() => setReviewValue(after), [after]);

  const finishReview = (value = reviewValue) => {
    onReview(value);
    setEditing(false);
    setReviewing(false);
  };

  const reviewEditedValue = () => {
    if (!reviewValue.trim()) return;
    if (risk === 'high') {
      setEditing(false);
      setReviewing(true);
      return;
    }
    finishReview();
  };

  return (
    <article className="border-t border-os-rule-dark py-5" data-before-after-proposal="true" data-risk={risk}>
      <div data-reading-role="caption" className="grid gap-2 font-data uppercase tracking-[0.08em] text-os-muted-dark sm:grid-cols-2">
        <span data-proposal-source={source}>{t('proposalSource')} / {source}</span>
        <span className="sm:text-right" data-proposal-scope={scope}>{t('proposalScope')} / {scope}</span>
      </div>
      <div className="mt-4 grid gap-px bg-os-rule-dark sm:grid-cols-2">
        <div className="bg-os-black-1 p-4">
          <span data-reading-role="caption" className="font-data uppercase tracking-[0.08em] text-os-muted-dark">{t('proposalBefore')}</span>
          <p data-reading-role="reading" className="mb-0 mt-3 text-[1.0625rem] leading-[var(--leading-reading)] text-os-muted-dark">{before || t('proposalEmpty')}</p>
        </div>
        <div className="bg-os-black-1 p-4">
          <span data-reading-role="caption" className="font-data uppercase tracking-[0.08em] text-os-muted-dark">{t('proposalAfter')}</span>
          {editing ? (
            <textarea
              aria-label={t('editSuggestion')}
              className="mt-3 min-h-36 w-full resize-y border border-os-rule-dark bg-os-black-0 p-3 text-[1.0625rem] leading-[var(--leading-reading)] text-os-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              data-reading-role="reading"
              onChange={(event) => setReviewValue(event.target.value)}
              value={reviewValue}
            />
          ) : (
            <p data-reading-role="reading" className="mb-0 mt-3 text-[1.0625rem] leading-[var(--leading-reading)] text-os-paper">{reviewValue}</p>
          )}
        </div>
      </div>
      {evidenceQuote && evidenceLocator ? (
        <blockquote className="mt-4 border-l-2 border-os-rule-dark pl-4" data-proposal-evidence={evidenceLocator}>
          <p className="m-0 font-data text-xs uppercase tracking-[0.08em] text-os-muted-dark">{evidenceLocator}</p>
          <p className="mb-0 mt-2 text-base leading-[var(--leading-body)] text-os-paper">{evidenceQuote}</p>
        </blockquote>
      ) : null}
      {status === 'pending' ? (
        <div className="mt-4 flex justify-end gap-2">
          {onDismiss && <button data-reading-role="control" className="min-h-10 rounded-panel border border-os-rule-dark bg-transparent px-3 text-sm text-os-muted-dark" onClick={onDismiss}>{t('dismissSuggestion')}</button>}
          {editing ? (
            <>
              <button className="min-h-10 rounded-panel border border-os-rule-dark bg-transparent px-3 text-sm text-os-paper" onClick={() => { setReviewValue(after); setEditing(false); }}>{t('cancelEditSuggestion')}</button>
              <button className="min-h-10 rounded-panel border-0 bg-os-paper px-3 text-sm font-semibold text-os-black-0 disabled:opacity-40" disabled={!reviewValue.trim()} onClick={reviewEditedValue}>{t('applyEditedChange')}</button>
            </>
          ) : (
            <button className="min-h-10 rounded-panel border border-os-rule-dark bg-transparent px-3 text-sm text-os-paper" onClick={() => setEditing(true)}>{t('editSuggestion')}</button>
          )}
          {!editing && (risk === 'high' ? (
            <Dialog onOpenChange={setReviewing} open={reviewing}>
              <DialogTrigger asChild>
                <button className="min-h-10 rounded-panel border border-os-paper bg-transparent px-3 text-sm font-semibold text-os-paper" ref={highRiskTriggerRef}>{t('reviewChanges')}</button>
              </DialogTrigger>
                <DialogContent
                  aria-describedby={undefined}
                  className="inset-0 left-0 top-0 max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none border-0 bg-os-paper-strong p-4 text-os-ink sm:p-8"
                  onCloseAutoFocus={(event) => {
                    event.preventDefault();
                    highRiskTriggerRef.current?.focus();
                  }}
                >
                  <div className="mx-auto max-w-5xl border-y border-os-rule-paper py-8">
                    <p className="font-data text-xs text-os-vermilion-ink">{t('highImpactChange')} / {scope}</p>
                    <DialogTitle className="font-reading text-4xl font-normal text-os-ink sm:text-5xl">{t('reviewCompleteChange')}</DialogTitle>
                    <div className="mt-6 grid gap-px bg-os-rule-paper sm:grid-cols-2">
                      <p className="m-0 bg-os-paper p-5 font-reading text-lg leading-8 text-os-muted-paper">{before || t('proposalEmpty')}</p>
                      <p className="m-0 bg-os-paper-strong p-5 font-reading text-lg leading-8 text-os-ink">{reviewValue}</p>
                    </div>
                    <div className="mt-6 flex justify-end gap-3">
                      <DialogClose asChild><button className="min-h-11 rounded-panel border border-os-rule-paper bg-transparent px-4 text-os-ink">{t('returnToProposal')}</button></DialogClose>
                      <button className="min-h-11 rounded-panel border-0 bg-os-vermilion px-4 font-semibold text-white" onClick={() => finishReview()}>{t('applyReviewedChange')}</button>
                    </div>
                  </div>
                </DialogContent>
            </Dialog>
          ) : (
            <button className="min-h-10 rounded-panel border border-os-paper bg-transparent px-3 text-sm font-semibold text-os-paper" onClick={() => finishReview(after)}>{t('reviewChanges')}</button>
          ))}
        </div>
      ) : <p className="mb-0 mt-4 font-data text-xs uppercase tracking-[0.12em] text-os-muted-dark">{status}</p>}
    </article>
  );
}

export { BeforeAfterProposal };
