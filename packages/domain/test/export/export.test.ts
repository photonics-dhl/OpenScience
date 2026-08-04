import { describe, expect, it } from 'vitest';
import { buildManifest } from '../../src/export/manifest';
import { classifyArtifact } from '../../src/export/packager';
import { validateExportPackage } from '../../src/export/validate';
import { computeContentSha256 } from '../../src/identity/identifiers';
import { SDF_MANIFEST_SCHEMA_NAME } from '@openscience/sdf-schema';

const entries = [
  { logicalPath: 'fig.png', artifactId: 'a1', blobSha256: 'aa'.repeat(32) },
  { logicalPath: 'main.py', artifactId: 'a2', blobSha256: 'bb'.repeat(32) },
];

describe('buildManifest（§5.3 最小结构字段完整性）', () => {
  it('全字段序列化（objectId/versionId/contentHash/licenses/artifacts）', () => {
    const m = buildManifest({
      objectId: 'OSR-2026-000001',
      versionId: 'OSR-2026-000001-v1',
      version: 1,
      title: 'Example',
      visibility: 'public',
      publishedAt: '2026-07-24T00:00:00Z',
      artifacts: entries,
    });
    expect(m.schema).toBe(SDF_MANIFEST_SCHEMA_NAME);
    expect(m.schemaVersion).toBe('0.1.0');
    expect(m.objectId).toBe('OSR-2026-000001');
    expect(m.versionId).toBe('OSR-2026-000001-v1');
    expect(m.version).toBe(1);
    expect(m.title).toBe('Example');
    expect(m.visibility).toBe('public');
    expect(m.publishedAt).toBe('2026-07-24T00:00:00Z');
    expect(m.contentHash).toBe(`sha256:${computeContentSha256(entries)}`);
    expect(m.licenses).toEqual({ text: '', code: '', data: '' });
    expect(m.artifacts).toHaveLength(2);
    expect(m.parentVersion).toBeNull();
    expect(m.forkedFrom).toBeNull();
  });

  it('draft 态无 publishedAt', () => {
    const m = buildManifest({ objectId: 'OSR-2026-000002', versionId: 'OSR-2026-000002-v1', version: 1, title: 'D', visibility: 'private', artifacts: [] });
    expect(m.publishedAt).toBeUndefined();
  });
});

describe('classifyArtifact（§5.2 附件归位）', () => {
  it('图片 → figures/', () => {
    expect(classifyArtifact('fig.png')).toBe('figures/fig.png');
    expect(classifyArtifact('paper.pdf')).toBe('figures/paper.pdf');
  });

  it('代码 → code/', () => {
    expect(classifyArtifact('main.py')).toBe('code/main.py');
    expect(classifyArtifact('analysis.ipynb')).toBe('code/analysis.ipynb');
  });

  it('其余 → artifacts/', () => {
    expect(classifyArtifact('data.csv')).toBe('artifacts/data.csv');
  });
});

describe('validateExportPackage（§5.3 MUST 脱库校验）', () => {
  const m = buildManifest({ objectId: 'OSR-2026-000001', versionId: 'OSR-2026-000001-v1', version: 1, title: 'T', visibility: 'private', artifacts: [] });
  const core = { schemaVersion: '0.1.0', problem: 'P', insight: 'I', method: 'M', results: 'R', limitations: 'L', reproducibility: 'RP' };

  function makeFiles(overrides: Record<string, Buffer> = {}) {
    const files = [
      { path: 'manifest.json', content: Buffer.from(JSON.stringify(m)) },
      { path: 'sdf/core.json', content: Buffer.from(JSON.stringify(core)) },
      { path: 'sdf/relations.json', content: Buffer.from('{}') },
      { path: 'sdf/validation.json', content: Buffer.from('{"valid":true}') },
      { path: 'provenance/audit.json', content: Buffer.from('{}') },
      { path: 'versions/index.json', content: Buffer.from('[]') },
      ...Object.entries(overrides).map(([p, c]) => ({ path: p, content: c })),
    ];
    return files;
  }

  it('合法包（无附件）→ valid=true', async () => {
    const r = await validateExportPackage(makeFiles());
    expect(r.valid).toBe(true);
  });

  it('缺 manifest.json → invalid', async () => {
    const r = await validateExportPackage([]);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('manifest'))).toBe(true);
  });

  it('manifest Schema 不通过（缺 schemaVersion）→ invalid', async () => {
    const bad = { ...m, schemaVersion: undefined };
    const files = makeFiles({ 'manifest.json': Buffer.from(JSON.stringify(bad)) });
    const r = await validateExportPackage(files);
    expect(r.valid).toBe(false);
  });

  it('缺 sdf/core.json → invalid', async () => {
    const files = makeFiles().filter((f) => f.path !== 'sdf/core.json');
    const r = await validateExportPackage(files);
    expect(r.valid).toBe(false);
  });
});
