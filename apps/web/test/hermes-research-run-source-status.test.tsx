import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HermesResearchRunPanel } from '@/components/hermes/HermesResearchRunPanel';
import type { HermesResearchRun } from '@/lib/api';
import en from '@/messages/en.json';
import zh from '@/messages/zh.json';

const translations = vi.hoisted(() => ({ locale: 'en' }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, useState: vi.fn(actual.useState) };
});
vi.mock('next-intl', () => ({
  useLocale: () => translations.locale,
  useTranslations: (namespace: string) => (key: string, values?: Record<string, string>) => {
    let value: unknown = translations.locale === 'zh' ? zh : en;
    for (const part of `${namespace}.${key}`.split('.')) value = (value as Record<string, unknown>)[part];
    return String(value).replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? name));
  },
}));

beforeEach(() => { translations.locale = 'en'; });

const sourceRun = (): HermesResearchRun => ({
  id: 'run-1', researchObjectId: 'ro-1', actorId: 'actor-1', versionId: null,
  profile: 'visual-narrative-v1', maxAgentTasks: 9, sourceClaimIds: [],
  status: 'failed', version: 2, error: 'requires completed scientific review',
  createdAt: '2026-09-29T00:00:00Z', updatedAt: '2026-09-29T00:00:00Z',
  steps: [{ id: 'source-1', stage: 'source_ingestion', ordinal: 0, status: 'succeeded',
    ingestionTaskId: 'task-1', artifactId: 'file-1', agentTaskId: 'extract-1', error: null }],
});
function renderRun(run: HermesResearchRun) {
  vi.mocked(React.useState).mockReturnValueOnce([run, vi.fn()]);
  return renderToStaticMarkup(<HermesResearchRunPanel researchObjectId="ro-1" tasks={[]} runId="run-1" onRunCreated={() => {}} />);
}

describe('Hermes research run panel', () => {
  it.each([undefined, 'source-review-fresh'] as const)('uses the existing paid source-review disclosure and removes retry controls after progress refresh (%s)', recovery => {
    for (const locale of ['en', 'zh']) {
      translations.locale = locale;
      const copy = (locale === 'zh' ? zh : en).hermesRun;
      const run = sourceRun();
      run.canRetryGeneration = true;
      run.chargeableAttempts = 1;
      run.generationRecovery = recovery;
      const buttonLabel = recovery === 'source-review-fresh' ? copy.sourceReviewFresh : copy.narrative.resume;
      expect(run.versionId).toBeNull();
      const failed = renderRun(run);
      expect(failed).toContain(copy.narrative.resumeDescription);
      expect(failed).toContain(`>${buttonLabel}</button>`);
      if (recovery) {
        expect(buttonLabel).toBe(locale === 'zh' ? '重新审校并继续' : 'Re-review and continue');
        expect(failed).not.toContain(`>${copy.narrative.resume}</button>`);
      }
      expect(failed).not.toContain(copy.sourceParsingRetryDescription);
      expect(failed).not.toContain(copy.sourceParsingResume);
      expect(failed).not.toContain(copy.narrative.resumeMediaDescription);

      run.canRetryGeneration = false;
      run.status = 'running'; run.error = null;
      const continuing = renderRun(run);
      expect(continuing).not.toContain(`>${buttonLabel}</button>`);
      expect(continuing).not.toContain(copy.narrative.resumeDescription);

      run.status = 'succeeded'; run.versionId = 'version-1';
      const completed = renderRun(run);
      expect(completed).toContain('/overview?version=version-1');
      expect(completed).not.toContain(`>${buttonLabel}</button>`);
    }
  });

  it.each(['en', 'zh'])('does not describe bound source tasks as idle when their live status is not projected (%s)', locale => {
    translations.locale = locale;
    const run = sourceRun(); run.status = 'running'; run.error = null;
    run.steps[0]!.status = 'waiting';
    run.steps.push({ ...run.steps[0]!, id: 'review-1', stage: 'source_review', agentTaskId: 'review-task' });
    const html = renderRun(run);
    const copy = (locale === 'zh' ? zh : en).hermesRun;
    const expected = locale === 'zh' ? '等待处理结果' : 'Awaiting result';
    expect(html.split(expected)).toHaveLength(3);
    expect(html).toContain(copy.narrative.status.understanding);
    expect(html).not.toContain(`>${copy.step.waiting}<`);
    expect(html).not.toContain(`>${copy.step.running}<`);
    expect(html).not.toContain(copy.sourceParsingEnded);
  });

  it('keeps unbound, terminal and explicitly running step states distinct', () => {
    const run = sourceRun(); run.status = 'awaiting_source_review'; run.steps[0]!.status = 'waiting';
    run.steps[0]!.agentTaskId = null;
    expect(renderRun(run)).toContain(`>${en.hermesRun.step.waiting}<`);
    run.steps[0]!.agentTaskId = 'extract-1'; run.status = 'stopped';
    expect(renderRun(run)).toContain(`>${en.hermesRun.step.waiting}<`);
    run.status = 'running'; run.steps[0]!.status = 'running';
    expect(renderRun(run)).toContain(`>${en.hermesRun.step.running}<`);
  });

  it.each(['en', 'zh'])('does not equate an ended extraction task with completed understanding (%s)', (locale) => {
    translations.locale = locale;
    const html = renderRun(sourceRun());
    const copy = (locale === 'zh' ? zh : en).hermesRun;
    expect(html).toContain(locale === 'zh' ? '材料解析' : 'Source parsing');
    expect(html).toContain(locale === 'zh' ? '解析任务已结束' : 'Parsing task ended');
    expect(html).toContain(locale === 'zh' ? '此状态不代表全文理解或科学审校已完成。' : 'This status does not confirm complete paper understanding or scientific review.');
    expect(html).toContain(copy.narrative.status.incomplete);
    expect(html).not.toContain(copy.narrative.viewResult);
    expect(html).not.toContain(`>${copy.step.succeeded}<`);
    expect(html).not.toContain('page 18');
  });

  it.each(['en', 'zh'])('shows the exact parser diagnostic and non-free recovery disclosure (%s)', (locale) => {
    translations.locale = locale;
    const run = sourceRun();
    run.sourceParsing = { status: 'needs_review', ingestionTaskId: 'task-1', agentTaskId: 'extract-1', unresolvedPageNumbers: [18], providerChargeMayApply: true };
    run.generationRecovery = 'source-parser'; run.canRetryGeneration = true; run.chargeableAttempts = 0;
    const html = renderRun(run);
    const copy = (locale === 'zh' ? zh : en).hermesRun;
    expect(html).toContain(copy.narrative.status.parsingIncomplete);
    expect(html).toContain(copy.sourceParsingIncomplete);
    expect(html).toContain(copy.sourceParsingPages.replace('{pages}', '18'));
    expect(html).toContain(copy.sourceParsingResume);
    expect(html).toContain(copy.sourceParsingRetryDescription);
    expect(html).not.toContain(copy.narrative.resumeDescription);
    expect(html).not.toContain(copy.sourceParsingEnded);
  });

  it('does not invent page numbers or offer recovery without server eligibility', () => {
    const run = sourceRun();
    run.sourceParsing = { status: 'needs_review', ingestionTaskId: 'task-1', agentTaskId: 'extract-1', providerChargeMayApply: true };
    const html = renderRun(run);
    expect(html).toContain(en.hermesRun.narrative.status.parsingIncomplete);
    expect(html).not.toContain('Pages awaiting parsing:');
    expect(html).not.toContain(en.hermesRun.sourceParsingResume);
  });

  it('does not attach another task diagnostic to the displayed source', () => {
    const run = sourceRun();
    run.sourceParsing = { status: 'needs_review', ingestionTaskId: 'different-task', agentTaskId: 'extract-1', unresolvedPageNumbers: [18], providerChargeMayApply: true };
    const html = renderRun(run);
    expect(html).not.toContain(en.hermesRun.narrative.status.parsingIncomplete);
    expect(html).not.toContain('Pages awaiting parsing:');
  });

  it.each(['running', 'waiting', 'failed'] as const)('retains the real non-success parser state: %s', status => {
    const run = sourceRun(); run.steps[0]!.status = status;
    const html = renderRun(run);
    expect(html).toContain(en.hermesRun.step[status]);
    expect(html).not.toContain(en.hermesRun.sourceParsingEnded);
  });

  it('retains completed scientific review and the result link for a succeeded run', () => {
    const run = sourceRun(); run.status = 'succeeded'; run.versionId = 'version-1'; run.error = null;
    run.steps.push({ ...run.steps[0]!, id: 'review-1', stage: 'source_review', ingestionTaskId: undefined, agentTaskId: 'review-task' });
    const html = renderRun(run);
    expect(html).toContain(en.hermesRun.narrative.status.complete);
    expect(html).toContain(en.hermesRun.stage.source_review);
    expect(html).toContain(`>${en.hermesRun.step.succeeded}<`);
    expect(html).toContain('/overview?version=version-1');
  });
});
