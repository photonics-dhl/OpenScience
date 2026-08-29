'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import type { PublicEvidence, PublicEvidenceSource } from '../../lib/api';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { EvidenceSourceBody } from './EvidenceRail';

export function EvidenceSheet({ open, onOpenChange, evidence, source, loading, error }: { open: boolean; onOpenChange: (open: boolean) => void; evidence: PublicEvidence | null; source: PublicEvidenceSource | null; loading: boolean; error: boolean }) {
  const t = useTranslations('public.claimReader');
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="pub-evidence-sheet" data-evidence-sheet="true">
      <DialogTitle>{t('sourceInspector')}</DialogTitle>
      <DialogDescription>{t('sourceInspectorDescription')}</DialogDescription>
      <EvidenceSourceBody evidence={evidence} source={source} loading={loading} error={error} />
      <DialogClose className="pub-sheet-close">{t('close')}</DialogClose>
    </DialogContent>
  </Dialog>;
}
