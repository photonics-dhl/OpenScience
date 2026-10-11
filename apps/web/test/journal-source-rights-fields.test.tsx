import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SourceRightsFields, emptySourcePermissions, permittedSourcePermissions, sourceRightsIssues, type SourceRightsValue } from '../components/journals/SourceRightsFields';

vi.mock('next-intl', () => ({ useLocale: () => 'zh' }));

const value = (parts: Partial<SourceRightsValue> = {}): SourceRightsValue => ({
  rightsStatus: 'unknown', sourceConfidence: 'editor_claimed', license: '', evidence: '', expiresAt: '', permissions: emptySourcePermissions(), ...parts,
});

describe('journal research material rights', () => {
  it('requires a real evidence statement even when rights are unknown and grants no public rights', () => {
    const draft = value();
    expect(sourceRightsIssues(draft, 'abstract')).toEqual(['needsEvidence']);
    expect(Object.values(draft.permissions).every((allowed) => !allowed)).toBe(true);
    expect(sourceRightsIssues(value({ evidence: 'Publisher notice reviewed by editor' }), 'abstract')).toEqual([]);
  });

  it('requires evidence for an asserted status, and license only for derivative or public tasks', () => {
    const internal = value({ rightsStatus: 'internal_processing_only', permissions: { ...emptySourcePermissions(), internalProcessing: true } });
    expect(sourceRightsIssues(internal, 'editor_uploaded_pdf')).toEqual(['needsEvidence']);
    expect(sourceRightsIssues({ ...internal, evidence: 'PDF p. 2' }, 'editor_uploaded_pdf')).toEqual([]);
    const privateDraft = { ...internal, evidence: 'PDF p. 2', permissions: { ...internal.permissions, derivativeGeneration: true } };
    expect(sourceRightsIssues(privateDraft, 'editor_uploaded_pdf')).toEqual(['needsLicense']);
  });

  it('removes rights exceeding a new status without granting anything in the new status', () => {
    const all = Object.fromEntries(Object.keys(emptySourcePermissions()).map((key) => [key, true])) as SourceRightsValue['permissions'];
    expect(permittedSourcePermissions('unknown', all)).toEqual(emptySourcePermissions());
    expect(permittedSourcePermissions('internal_processing_only', all)).toEqual({ ...emptySourcePermissions(), internalProcessing: true, derivativeGeneration: true, externalProcessing: true });
    expect(permittedSourcePermissions('full_public_processing_allowed', emptySourcePermissions())).toEqual(emptySourcePermissions());
  });

  it('enforces material-specific server conditions and primary-source status', () => {
    expect(sourceRightsIssues(value({ rightsStatus: 'abstract_processing_allowed', evidence: 'statement' }), 'figure_asset')).toContain('abstractOnly');
    expect(sourceRightsIssues(value({ rightsStatus: 'figure_reuse_allowed', evidence: 'statement' }), 'figure_asset')).toContain('figureOnly');
    expect(sourceRightsIssues(value({ rightsStatus: 'derivative_illustration_allowed', evidence: 'statement' }), 'abstract')).toContain('illustrationRequired');
    expect(sourceRightsIssues(value(), 'abstract', true)).toContain('activeInvalid');
  });

  it('renders permanent field help and independent, initially off public and AI choices', () => {
    const html = renderToStaticMarkup(<SourceRightsFields idPrefix="material" value={value()} onChange={() => {}} sourceType="abstract" />);
    expect(html).toContain('aria-describedby="material-status-help"');
    expect(html).toContain('aria-describedby="material-license-help"');
    expect(html).toContain('aria-describedby="material-evidence-help"');
    expect(html).toContain('aria-required="true"');
    expect(html).toContain('处理可能将论文文本发送至配置的外部模型服务');
    expect(html).toContain('公开原文');
    expect(html).toContain('复用原图');
    expect(html).not.toContain('checked=""');
  });
});
