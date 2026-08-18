'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import * as Dialog from '@radix-ui/react-dialog';

export interface BeforeAfterProposalProps {
  after: string;
  before: string;
  onDismiss?: () => void;
  onReview: () => void;
  risk?: 'normal' | 'high';
  scope: string;
  source: string;
  status?: 'pending' | 'applied' | 'dismissed';
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
}: BeforeAfterProposalProps) {
  const [reviewing, setReviewing] = useState(false);
  const highRiskTriggerRef = useRef<HTMLButtonElement>(null);
  const t = useTranslations('editor');

  const finishReview = () => {
    onReview();
    setReviewing(false);
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
          <p data-reading-role="reading" className="mb-0 mt-3 text-[1.0625rem] leading-[var(--leading-reading)] text-os-paper">{after}</p>
        </div>
      </div>
      {status === 'pending' ? (
        <div className="mt-4 flex justify-end gap-2">
          {onDismiss && <button data-reading-role="control" className="min-h-10 rounded-panel border border-os-rule-dark bg-transparent px-3 text-sm text-os-muted-dark" onClick={onDismiss}>{t('dismissSuggestion')}</button>}
          {risk === 'high' ? (
            <Dialog.Root onOpenChange={setReviewing} open={reviewing}>
              <Dialog.Trigger asChild>
                <button className="min-h-10 rounded-panel border border-os-paper bg-transparent px-3 text-sm font-semibold text-os-paper" ref={highRiskTriggerRef}>{t('reviewChanges')}</button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-(--z-modal) bg-os-black-0/95" />
                <Dialog.Content
                  aria-describedby={undefined}
                  className="fixed inset-0 z-(--z-modal) overflow-y-auto bg-os-black-0 p-4 sm:p-8"
                  onCloseAutoFocus={(event) => {
                    event.preventDefault();
                    highRiskTriggerRef.current?.focus();
                  }}
                >
                  <div className="mx-auto max-w-5xl border-y border-os-rule-dark py-8">
                    <p className="font-data text-xs uppercase tracking-[0.15em] text-os-vermilion">{t('highImpactChange')} / {scope}</p>
                    <Dialog.Title className="font-editorial text-4xl font-normal text-os-paper sm:text-5xl">{t('reviewCompleteChange')}</Dialog.Title>
                    <div className="grid gap-px bg-os-rule-dark sm:grid-cols-2">
                      <p className="m-0 bg-os-black-1 p-5 text-os-muted-dark">{before || t('proposalEmpty')}</p>
                      <p className="m-0 bg-os-black-1 p-5 text-os-paper">{after}</p>
                    </div>
                    <div className="mt-6 flex justify-end gap-3">
                      <Dialog.Close asChild><button className="min-h-11 rounded-panel border border-os-rule-dark bg-transparent px-4 text-os-paper">{t('returnToProposal')}</button></Dialog.Close>
                      <button className="min-h-11 rounded-panel border-0 bg-os-vermilion px-4 font-semibold text-os-black-0" onClick={finishReview}>{t('applyReviewedChange')}</button>
                    </div>
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          ) : (
            <button className="min-h-10 rounded-panel border border-os-paper bg-transparent px-3 text-sm font-semibold text-os-paper" onClick={onReview}>{t('reviewChanges')}</button>
          )}
        </div>
      ) : <p className="mb-0 mt-4 font-data text-xs uppercase tracking-[0.12em] text-os-muted-dark">{status}</p>}
    </article>
  );
}

export { BeforeAfterProposal };
