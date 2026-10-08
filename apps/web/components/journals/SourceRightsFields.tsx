'use client';

import * as React from 'react';
import type { JournalArticleSourceRecord, JournalRightsStatus, JournalSourceConfidence, JournalSourceType } from '@/lib/journal-api';
import { useJournalMaterialsCopy, type JournalMaterialsCopy } from './journal-materials-copy';

export type SourcePermissions = JournalArticleSourceRecord['permissions'];
export type SourceRightsValue = {
  rightsStatus: JournalRightsStatus;
  sourceConfidence: JournalSourceConfidence;
  license: string;
  evidence: string;
  expiresAt: string;
  permissions: SourcePermissions;
};

export const emptySourcePermissions = (): SourcePermissions => ({
  internalProcessing: false, derivativeGeneration: false, publicSource: false,
  publicDerivative: false, externalProcessing: false, figureReuse: false,
  derivativeIllustration: false,
});

export const statusPermissions: Record<JournalRightsStatus, Array<keyof SourcePermissions>> = {
  unknown: [], metadata_only_allowed: [],
  abstract_processing_allowed: ['internalProcessing', 'derivativeGeneration', 'externalProcessing'],
  internal_processing_only: ['internalProcessing', 'derivativeGeneration', 'externalProcessing'],
  public_summary_allowed: ['internalProcessing', 'derivativeGeneration', 'externalProcessing', 'publicDerivative'],
  figure_reuse_allowed: ['publicSource', 'figureReuse'],
  derivative_illustration_allowed: ['internalProcessing', 'derivativeGeneration', 'externalProcessing', 'derivativeIllustration'],
  full_public_processing_allowed: ['internalProcessing', 'derivativeGeneration', 'publicSource', 'publicDerivative', 'externalProcessing', 'figureReuse', 'derivativeIllustration'],
  restricted_blocked: [],
};

export function permittedSourcePermissions(status: JournalRightsStatus, permissions: SourcePermissions): SourcePermissions {
  const allowed = new Set(statusPermissions[status]);
  return Object.fromEntries((Object.keys(emptySourcePermissions()) as Array<keyof SourcePermissions>).map((key) => [key, allowed.has(key) && permissions[key]])) as SourcePermissions;
}

export function sourceRightsIssues(value: SourceRightsValue, sourceType?: JournalSourceType, activeForGeneration = false): Array<keyof JournalMaterialsCopy> {
  const issues: Array<keyof JournalMaterialsCopy> = [];
  const p = value.permissions;
  if ((Object.values(p).some(Boolean) || value.rightsStatus !== 'unknown') && !value.evidence.trim()) issues.push('needsEvidence');
  if ((p.derivativeGeneration || p.publicDerivative || p.publicSource || p.figureReuse || p.derivativeIllustration) && !value.license.trim()) issues.push('needsLicense');
  if ((Object.keys(p) as Array<keyof SourcePermissions>).some((key) => p[key] && !statusPermissions[value.rightsStatus].includes(key))) issues.push('statusMismatch');
  if (sourceType && value.rightsStatus === 'abstract_processing_allowed' && sourceType !== 'abstract') issues.push('abstractOnly');
  if (sourceType && value.rightsStatus === 'figure_reuse_allowed' && (sourceType !== 'figure_asset' || !p.figureReuse)) issues.push('figureOnly');
  if (value.rightsStatus === 'derivative_illustration_allowed' && !p.derivativeIllustration) issues.push('illustrationRequired');
  if (activeForGeneration && !['abstract_processing_allowed', 'internal_processing_only', 'public_summary_allowed', 'full_public_processing_allowed'].includes(value.rightsStatus)) issues.push('activeInvalid');
  return issues;
}

export function SourceRightsFields({ value, onChange, disabled = false, idPrefix, sourceType, activeForGeneration = false }: {
  value: SourceRightsValue;
  onChange: (next: SourceRightsValue) => void;
  disabled?: boolean;
  idPrefix: string;
  sourceType?: JournalSourceType;
  activeForGeneration?: boolean;
}) {
  const t = useJournalMaterialsCopy();
  const p = value.permissions;
  const aiKeys = ['internalProcessing', 'derivativeGeneration', 'externalProcessing'] as const;
  const aiAllowed = aiKeys.every((key) => statusPermissions[value.rightsStatus].includes(key));
  const aiChecked = aiKeys.every((key) => p[key]);
  const aiPartial = !aiChecked && aiKeys.some((key) => p[key]);
  const aiRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { if (aiRef.current) aiRef.current.indeterminate = aiPartial; }, [aiPartial]);
  const evidenceRequired = Object.values(p).some(Boolean) || value.rightsStatus !== 'unknown';
  const licenseRequired = p.derivativeGeneration || p.publicDerivative || p.publicSource || p.figureReuse || p.derivativeIllustration;
  const update = (part: Partial<SourceRightsValue>) => onChange({ ...value, ...part });
  const task = (key: keyof SourcePermissions, label: string, help?: string) => (
    <label key={key} className="flex items-start gap-2 text-sm">
      <input className="mt-1 accent-teal-700" type="checkbox" disabled={disabled || !statusPermissions[value.rightsStatus].includes(key)} checked={p[key] && statusPermissions[value.rightsStatus].includes(key)} onChange={(event) => update({ permissions: { ...p, [key]: event.target.checked } })} />
      <span><span className="block">{label}</span>{help ? <span className="mt-1 block text-sm leading-relaxed text-os-muted-paper">{help}</span> : null}</span>
    </label>
  );
  const issues = sourceRightsIssues(value, sourceType, activeForGeneration);
  const privateReady = aiChecked && Boolean(value.evidence.trim()) && Boolean(value.license.trim()) && !issues.length;

  return <div className="grid gap-4 sm:grid-cols-2">
    <label className="grid gap-1 text-sm" htmlFor={`${idPrefix}-status`}>
      {t.status}<select id={`${idPrefix}-status`} aria-describedby={`${idPrefix}-status-help`} disabled={disabled} className="min-h-10 border border-os-rule-paper bg-transparent px-3" value={value.rightsStatus} onChange={(event) => { const status = event.target.value as JournalRightsStatus; update({ rightsStatus: status, permissions: permittedSourcePermissions(status, p) }); }}>
        {(Object.keys(statusPermissions) as JournalRightsStatus[]).map((status) => <option value={status} key={status}>{t[status]}</option>)}
      </select><span id={`${idPrefix}-status-help`} className="text-sm leading-relaxed text-os-muted-paper">{t.statusHelp}</span>
    </label>
    <label className="grid gap-1 text-sm" htmlFor={`${idPrefix}-confidence`}>
      {t.confidence}<select id={`${idPrefix}-confidence`} disabled={disabled} className="min-h-10 border border-os-rule-paper bg-transparent px-3" value={value.sourceConfidence} onChange={(event) => update({ sourceConfidence: event.target.value as JournalSourceConfidence })}>
        {(['verified', 'editor_claimed', 'author_claimed', 'publicly_accessible', 'machine_parsed_only', 'conflict', 'expired', 'revoked'] as JournalSourceConfidence[]).map((confidence) => <option value={confidence} key={confidence}>{t[confidence]}</option>)}
      </select>
    </label>
    <label className="grid gap-1 text-sm" htmlFor={`${idPrefix}-license`}>
      {t.license}{licenseRequired ? t.required : t.optional}<input id={`${idPrefix}-license`} aria-describedby={`${idPrefix}-license-help`} aria-required={licenseRequired} disabled={disabled} className="min-h-10 border border-os-rule-paper bg-transparent px-3" value={value.license} onChange={(event) => update({ license: event.target.value })} />
      <span id={`${idPrefix}-license-help`} className="text-sm leading-relaxed text-os-muted-paper">{t.licenseHelp}</span>
    </label>
    <fieldset className="sm:col-span-2" disabled={disabled}>
      <legend className="text-sm font-medium">{t.tasks}</legend>
      <label className="mt-3 flex items-start gap-2 text-sm"><input ref={aiRef} className="mt-1 accent-teal-700" type="checkbox" disabled={disabled || !aiAllowed} checked={aiChecked} onChange={(event) => update({ permissions: { ...p, internalProcessing: event.target.checked, derivativeGeneration: event.target.checked, externalProcessing: event.target.checked } })} /><span><span className="block">{t.hermesCombined}</span><span className="mt-1 block text-sm leading-relaxed text-os-muted-paper">{t.hermesCombinedHelp}</span></span></label>
      {aiPartial ? <p className="mt-2 text-sm text-os-muted-paper">{t.partialAiRights}</p> : null}
      <p className="mt-4 text-sm leading-relaxed text-os-muted-paper">{t.publicHelp}</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {task('publicDerivative', t.publicInterpretation)}
        {task('publicSource', t.publicSource)}
        {task('figureReuse', t.figure)}
        {task('derivativeIllustration', t.illustration)}
      </div>
    </fieldset>
    <label className="grid gap-1 text-sm sm:col-span-2" htmlFor={`${idPrefix}-evidence`}>
      {t.evidence}{evidenceRequired ? t.required : t.optional}<textarea id={`${idPrefix}-evidence`} aria-describedby={`${idPrefix}-evidence-help`} aria-required={evidenceRequired} disabled={disabled} rows={3} className="border border-os-rule-paper bg-transparent p-3 placeholder:text-os-muted-paper" placeholder={t.evidenceExample} value={value.evidence} onChange={(event) => update({ evidence: event.target.value })} />
      <span id={`${idPrefix}-evidence-help`} className="text-sm leading-relaxed text-os-muted-paper">{t.evidenceHelp}</span>
    </label>
    <div className="sm:col-span-2 text-sm" aria-live="polite">
      <p>{privateReady ? t.privateReady : t.privateNotReady}</p>
      {!privateReady ? <p className="mt-1 text-os-muted-paper">{t.missingPrivate}</p> : null}
      {issues.length ? <ul className="mt-2 space-y-1 text-os-vermilion-ink">{issues.map((issue) => <li key={issue}>{t[issue]}</li>)}</ul> : null}
    </div>
  </div>;
}
