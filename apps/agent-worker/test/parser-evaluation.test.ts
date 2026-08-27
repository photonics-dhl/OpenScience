import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildCandidateEvaluationReport,
  evaluateParserCandidate,
  parseCandidateRunOutcome,
  serializeCandidateEvaluationReport,
  type CandidateCase,
  type CandidateRunner,
} from '../src/parser-evaluation';

const sha = (digit: string) => digit.repeat(64);
const repositoryRoot = resolve(import.meta.dirname, '../../..');
const evaluationScript = resolve(repositoryRoot, 'infra/scripts/evaluate-document-parsers.sh');
const evaluationScriptArgument = evaluationScript.replaceAll('\\', '/');
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';

describe('buildCandidateEvaluationReport', () => {
  it('keeps failures in latency metrics and emits only bounded evidence fields', () => {
    const report = buildCandidateEvaluationReport({
      candidate: {
        name: 'liteparse',
        version: '2.14.0',
        imageDigest: `sha256:${sha('a')}`,
        license: 'Apache-2.0',
      },
      cases: [
        { id: 'one', contentHash: sha('1'), status: 'succeeded', locatorMatches: 1, locatorTotal: 1, elapsedMs: 10, peakRssBytes: 100 },
        { id: 'two', contentHash: sha('2'), status: 'succeeded', locatorMatches: 1, locatorTotal: 1, elapsedMs: 20, peakRssBytes: 200 },
        { id: 'three', contentHash: sha('3'), status: 'needs_review', locatorMatches: 0, locatorTotal: 1, elapsedMs: 30, peakRssBytes: 300, errorCode: 'locator_miss' },
        { id: 'four', contentHash: sha('4'), status: 'succeeded', locatorMatches: 1, locatorTotal: 1, elapsedMs: 40, peakRssBytes: 400 },
        { id: 'five', contentHash: sha('5'), status: 'failed', locatorMatches: 0, locatorTotal: 1, elapsedMs: 50, peakRssBytes: 500, errorCode: 'parser_exit' },
      ],
    });

    expect(report).toEqual({
      schemaVersion: 1,
      candidate: {
        name: 'liteparse',
        version: '2.14.0',
        imageDigest: `sha256:${sha('a')}`,
        license: 'Apache-2.0',
      },
      summary: {
        cases: 5,
        succeeded: 3,
        needsReview: 1,
        failed: 1,
        locatorMatches: 3,
        locatorTotal: 5,
        p50ElapsedMs: 30,
        p95ElapsedMs: 50,
        peakRssBytes: 500,
      },
      cases: [
        { id: 'one', contentHash: sha('1'), status: 'succeeded', locatorMatches: 1, locatorTotal: 1, elapsedMs: 10, peakRssBytes: 100 },
        { id: 'two', contentHash: sha('2'), status: 'succeeded', locatorMatches: 1, locatorTotal: 1, elapsedMs: 20, peakRssBytes: 200 },
        { id: 'three', contentHash: sha('3'), status: 'needs_review', locatorMatches: 0, locatorTotal: 1, elapsedMs: 30, peakRssBytes: 300, errorCode: 'locator_miss' },
        { id: 'four', contentHash: sha('4'), status: 'succeeded', locatorMatches: 1, locatorTotal: 1, elapsedMs: 40, peakRssBytes: 400 },
        { id: 'five', contentHash: sha('5'), status: 'failed', locatorMatches: 0, locatorTotal: 1, elapsedMs: 50, peakRssBytes: 500, errorCode: 'parser_exit' },
      ],
    });
    expect(JSON.stringify(report)).not.toContain('sourceText');
    expect(JSON.stringify(report)).not.toContain('/opt/openscience');
  });

  it('rejects duplicate cases and unknown fields instead of spreading sensitive input', () => {
    const candidate = {
      name: 'current-parser', version: '1.0.0', imageDigest: `sha256:${sha('b')}`, license: 'project',
    };
    const item = {
      id: 'duplicate', contentHash: sha('6'), status: 'succeeded' as const,
      locatorMatches: 1, locatorTotal: 1, elapsedMs: 1, peakRssBytes: 1,
    };

    expect(() => buildCandidateEvaluationReport({ candidate, cases: [item, item] })).toThrow(/duplicate/i);
    expect(() => buildCandidateEvaluationReport({
      candidate,
      cases: [{ ...item, sourceText: 'private evidence', absolutePath: '/opt/openscience/private.pdf' }],
    } as never)).toThrow(/unknown field/i);
  });

  it('serializes a validated report with one trailing newline', () => {
    const input = {
      candidate: {
        name: 'current-parser', version: '1.0.0', imageDigest: `sha256:${sha('c')}`, license: 'project',
      },
      cases: [{
        id: 'native-pdf', contentHash: sha('7'), status: 'succeeded' as const,
        locatorMatches: 1, locatorTotal: 1, elapsedMs: 12, peakRssBytes: 256,
      }],
    };

    const serialized = serializeCandidateEvaluationReport(input);
    expect(serialized.endsWith('\n')).toBe(true);
    expect(serialized.endsWith('\n\n')).toBe(false);
    expect(JSON.parse(serialized)).toEqual(buildCandidateEvaluationReport(input));
  });

  it('accepts only the bounded candidate process outcome contract', () => {
    expect(parseCandidateRunOutcome({
      status: 'needs_review', locatorMatches: 1, elapsedMs: 12, peakRssBytes: 512, errorCode: 'locator_miss',
    })).toEqual({
      status: 'needs_review', locatorMatches: 1, elapsedMs: 12, peakRssBytes: 512, errorCode: 'locator_miss',
    });
    expect(() => parseCandidateRunOutcome({
      status: 'succeeded', locatorMatches: 1, elapsedMs: 12, peakRssBytes: 512, sourceText: 'private',
    })).toThrow(/unknown field/i);
    expect(() => parseCandidateRunOutcome({
      status: 'succeeded', locatorMatches: 2, elapsedMs: -1, peakRssBytes: 512,
    })).toThrow(/elapsed milliseconds/i);
    expect(() => parseCandidateRunOutcome({
      status: 'succeeded', locatorMatches: 2, elapsedMs: 1, peakRssBytes: 512, errorCode: 'parser_exit',
    })).toThrow(/succeeded.*error code/i);
  });

  it('rejects false-ready reports with missed locators or an error code', () => {
    const candidate = {
      name: 'current-parser', version: '1.0.0', imageDigest: `sha256:${sha('2')}`, license: 'project',
    };
    expect(() => buildCandidateEvaluationReport({
      candidate,
      cases: [{
        id: 'partial', contentHash: sha('3'), status: 'succeeded', locatorMatches: 1, locatorTotal: 2,
        elapsedMs: 1, peakRssBytes: 1,
      }],
    })).toThrow(/succeeded.*all locators/i);
    expect(() => buildCandidateEvaluationReport({
      candidate,
      cases: [{
        id: 'error', contentHash: sha('4'), status: 'succeeded', locatorMatches: 1, locatorTotal: 1,
        elapsedMs: 1, peakRssBytes: 1, errorCode: 'parser_exit',
      }],
    })).toThrow(/succeeded.*error code/i);
  });

  it('evaluates corpus cases sequentially and preserves failed-case metrics', async () => {
    const visited: string[] = [];
    const runner: CandidateRunner = {
      candidate: {
        name: 'layout-candidate', version: '1.2.3', imageDigest: `sha256:${sha('d')}`, license: 'Apache-2.0',
      },
      async run(item) {
        visited.push(item.id);
        if (item.id === 'broken') {
          return { status: 'failed', locatorMatches: 0, elapsedMs: 90, peakRssBytes: 900, errorCode: 'parser_exit' };
        }
        return { status: 'succeeded', locatorMatches: item.locatorTotal, elapsedMs: 10, peakRssBytes: 100 };
      },
    };
    const corpus: CandidateCase[] = [
      { id: 'native', fixtureName: 'native.pdf', contentHash: sha('8'), locatorTotal: 2 },
      { id: 'broken', fixtureName: 'broken.pdf', contentHash: sha('9'), locatorTotal: 1 },
    ];

    const report = await evaluateParserCandidate(runner, corpus);

    expect(visited).toEqual(['native', 'broken']);
    expect(report.summary).toEqual({
      cases: 2,
      succeeded: 1,
      needsReview: 0,
      failed: 1,
      locatorMatches: 2,
      locatorTotal: 3,
      p50ElapsedMs: 10,
      p95ElapsedMs: 90,
      peakRssBytes: 900,
    });
    expect(report.cases[1]).toEqual({
      id: 'broken', contentHash: sha('9'), status: 'failed', locatorMatches: 0, locatorTotal: 1,
      elapsedMs: 90, peakRssBytes: 900, errorCode: 'parser_exit',
    });
  });

  it('rejects runtime runner fields that could replace trusted corpus identity', async () => {
    const runner: CandidateRunner = {
      candidate: {
        name: 'layout-candidate', version: '1.2.3', imageDigest: `sha256:${sha('e')}`, license: 'Apache-2.0',
      },
      async run() {
        return {
          status: 'succeeded', locatorMatches: 1, elapsedMs: 10, peakRssBytes: 100,
          id: 'spoofed', contentHash: sha('f'), locatorTotal: 99,
        } as never;
      },
    };

    await expect(evaluateParserCandidate(runner, [
      { id: 'trusted', fixtureName: 'trusted.pdf', contentHash: sha('1'), locatorTotal: 1 },
    ])).rejects.toThrow(/unknown field/i);
  });
});

describe('document parser evaluation script', () => {
  it('publishes the immutable ECS sandbox contract without invoking Docker', () => {
    const output = execFileSync(bash, [evaluationScriptArgument, '--print-run-contract', 'liteparse'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    const contract = JSON.parse(output);

    expect(contract).toMatchObject({
      schemaVersion: 1,
      candidate: 'liteparse',
      evaluationRoot: `/opt/openscience-evals/document-parser/${contract.gitSha}`,
      sandbox: {
        network: 'none',
        readOnlyRoot: true,
        user: '10001:10001',
        cpus: 2,
        memoryBytes: 2_147_483_648,
        pidsLimit: 64,
        noNewPrivileges: true,
        capDrop: 'ALL',
        corpusReadOnly: true,
        outputKind: 'tmpfs',
        outputMaxBytes: 65_536,
      },
      processBoundary: {
        logDriver: 'none',
        hostCaptureMaxBytes: 65_536,
        copyTimeoutSeconds: 5,
        nonzeroExit: 'failed',
        timeoutAction: 'kill-container',
        publish: 'atomic-staging-rename',
      },
    });
    expect(contract.gitSha).toMatch(/^[a-f0-9]{40}$/);
  });

  it('builds the worker dependency closure for a clean content-addressed checkout', () => {
    const script = readFileSync(evaluationScript, 'utf8');
    const generateIndex = script.indexOf('npx pnpm@9.15.0 --filter @openscience/database generate');
    const buildIndex = script.indexOf('npx pnpm@9.15.0 --filter @openscience/agent-worker... build');

    expect(generateIndex).toBeGreaterThan(-1);
    expect(buildIndex).toBeGreaterThan(generateIndex);
  });

  it('rejects candidates outside the explicit allowlist', () => {
    const result = spawnSync(bash, [evaluationScriptArgument, '--print-run-contract', 'unknown-parser'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/unsupported candidate/i);
  });

  it('normalizes bounded process JSON through a separate stdin data channel', () => {
    const result = spawnSync(bash, [evaluationScriptArgument, '--normalize-outcome', 'liteparse'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      input: '{"status":"succeeded","locatorMatches":2,"elapsedMs":14,"peakRssBytes":1024}\n',
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      status: 'succeeded', locatorMatches: 2, elapsedMs: 14, peakRssBytes: 1024,
    });
    const privateResult = spawnSync(bash, [evaluationScriptArgument, '--normalize-outcome', 'liteparse'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      input: '{"status":"succeeded","locatorMatches":2,"elapsedMs":14,"peakRssBytes":1024,"sourceText":"private"}\n',
    });
    expect(privateResult.status).not.toBe(0);

    const contradictoryResult = spawnSync(bash, [evaluationScriptArgument, '--normalize-outcome', 'liteparse'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      input: '{"status":"succeeded","locatorMatches":2,"elapsedMs":14,"peakRssBytes":1024,"errorCode":"parser_exit"}\n',
    });
    expect(contradictoryResult.status).not.toBe(0);
  });

  it.runIf(process.platform !== 'linux')('refuses candidate execution outside the ECS host', () => {
    const result = spawnSync(bash, [evaluationScriptArgument, '--execute', 'liteparse'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/restricted to the ECS host/i);
  });
});
