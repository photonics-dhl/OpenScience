import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  deriveReleaseImageTags,
  parseReleaseCapability,
  parseMountInfo,
  parsePendingIntent,
  parseRetentionCli,
  selectInactiveReleaseShas,
} from './production-release-retention.mjs';

const active = 'a'.repeat(40);
const rollback = 'b'.repeat(40);
const inactive = 'c'.repeat(40);

test('retention selects only inactive lowercase SHA release directories', () => {
  assert.deepEqual(selectInactiveReleaseShas({
    activeSha: active,
    rollbackSha: rollback,
    entries: [inactive, rollback, 'notes', active],
  }), [inactive]);
  assert.throws(() => selectInactiveReleaseShas({
    activeSha: active,
    rollbackSha: active,
    entries: [],
  }), /must differ/u);
});

test('retention derives only exact release-scoped image tags', () => {
  assert.deepEqual(deriveReleaseImageTags(inactive), [
    `openscience-agent-worker:${inactive}`,
    `openscience-document-parser:${inactive}`,
    `openscience-embedding-worker:${inactive}`,
    `openscience-scansci-auth:${inactive}`,
    `openscience-scansci-legal:${inactive}`,
  ]);
});

test('schema 3 capability binds exact ScanSci image IDs and rejects tampering', () => {
  const legalId = `sha256:${'d'.repeat(64)}`;
  const authId = `sha256:${'e'.repeat(64)}`;
  const source = [
    'schema=3', 'embedding_deploy=false', 'bge_m3_enabled=false', 'model_version_id=',
    'model_revision=', 'source_sha256=', 'package_freeze_sha256=', 'model_manifest_sha256=',
    'scansci_deploy=true', `scansci_legal_image_id=${legalId}`, `scansci_auth_image_id=${authId}`,
  ].join('\n');
  assert.deepEqual(parseReleaseCapability(source), { embeddingDeploy: false, scansciDeploy: true, legalImageId: legalId, authImageId: authId });
  assert.throws(() => parseReleaseCapability(source.replace(legalId, `sha256:${'f'.repeat(64)}`), { expectedLegalImageId: legalId }), /invalid/u);
  assert.deepEqual(parseReleaseCapability(source.replace('schema=3', 'schema=2').split('\n').filter((line) => !line.startsWith('scansci_')).join('\n')), { embeddingDeploy: false, scansciDeploy: false });
});

test('mountinfo parser exposes nested cleanup boundaries with escaped paths decoded', () => {
  assert.deepEqual(parseMountInfo([
    '24 20 0:21 / / rw,relatime - ext4 /dev/root rw',
    `25 24 0:22 / ${`/opt/openscience-releases/${inactive}/nested\\040data`} rw - tmpfs tmpfs rw`,
  ].join('\n')), ['/', `/opt/openscience-releases/${inactive}/nested data`]);
});

test('pending intent is strict and binds candidate to rollback', () => {
  assert.deepEqual(parsePendingIntent(`${JSON.stringify({
    schemaVersion: 2,
    candidateSha: active,
    rollbackSha: rollback,
    releaseShas: [inactive],
    imageTags: deriveReleaseImageTags(inactive),
    capabilityShas: [inactive],
  })}\n`), {
    schemaVersion: 2,
    candidateSha: active,
    rollbackSha: rollback,
    releaseShas: [inactive],
    imageTags: deriveReleaseImageTags(inactive),
    capabilityShas: [inactive],
  });
  assert.throws(() => parsePendingIntent(JSON.stringify({
    schemaVersion: 2,
    candidateSha: active,
    rollbackSha: rollback,
    releaseShas: [],
    imageTags: [],
    capabilityShas: [],
    ignored: true,
  })), /identity is invalid/u);
  for (const protectedEntry of [
    { releaseShas: [active], imageTags: [], capabilityShas: [] },
    { releaseShas: [], imageTags: [`openscience-agent-worker:${rollback}`], capabilityShas: [] },
    { releaseShas: [], imageTags: [], capabilityShas: [rollback] },
  ]) {
    assert.throws(() => parsePendingIntent(JSON.stringify({
      schemaVersion: 2,
      candidateSha: active,
      rollbackSha: rollback,
      ...protectedEntry,
    })), /protected release/u);
  }
});

test('CLI requires fixed FD9 and explicit expected identity', () => {
  assert.deepEqual(parseRetentionCli([
    'complete', '--expected-active', active, '--expected-rollback', rollback, '--lock-fd', '9',
  ]), {
    command: 'complete',
    expectedActive: active,
    expectedRollback: rollback,
    lockFd: 9,
  });
  assert.throws(() => parseRetentionCli([
    'complete', '--expected-active', active, '--expected-rollback', rollback, '--lock-fd', '8',
  ]), /FD9/u);
});

test('automatic retention source contains no broad Docker prune', () => {
  const retentionSource = readFileSync(new URL('./production-release-retention.mjs', import.meta.url), 'utf8');
  for (const forbidden of [
    /docker\s+system\s+prune/u,
    /docker\s+image\s+prune/u,
    /docker\s+volume\s+prune/u,
    /docker\s+builder\s+prune/u,
    /['"](?:system|image|volume|builder)['"]\s*,\s*['"]prune['"]/u,
  ]) assert.doesNotMatch(retentionSource, forbidden);
});
