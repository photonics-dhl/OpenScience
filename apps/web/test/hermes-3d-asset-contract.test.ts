import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const assetPath = fileURLToPath(new URL('../public/hermes/hermes-scholar.glb', import.meta.url));

describe('Hermes 3D asset contract', () => {
  it('ships a real GLB asset instead of a raster concept', () => {
    expect(existsSync(assetPath), `missing ${assetPath}`).toBe(true);
  });

  it('contains the original scholar robot hierarchy, materials, clips, and release budgets', async () => {
    expect(existsSync(assetPath), `missing ${assetPath}`).toBe(true);
    const { inspectHermesGlb } = await import('../scripts/hermes/inspect-hermes-glb.mjs');
    const report = await inspectHermesGlb(assetPath);
    const requiredNodes = [
      'Hermes_Root', 'Hermes_Head', 'Hermes_Face', 'Hermes_Eye_L', 'Hermes_Eye_R',
      'Hermes_Torso', 'Hermes_Spine', 'Hermes_Core', 'Hermes_Mantle_L', 'Hermes_Mantle_R',
      'Hermes_MantleFront_L', 'Hermes_MantleFront_R', 'Hermes_BindingSpine',
      'Hermes_PageEdge_L', 'Hermes_PageEdge_R',
      'Hermes_Arm_L', 'Hermes_Forearm_L', 'Hermes_Hand_L',
      'Hermes_Arm_R', 'Hermes_Forearm_R', 'Hermes_Hand_R',
      'Hermes_Page_L_01', 'Hermes_Page_L_02', 'Hermes_Page_R_01', 'Hermes_Page_R_02',
    ];
    const requiredMaterials = [
      'Hermes_BoneCeramic', 'Hermes_SmokeGlass', 'Hermes_Titanium',
      'Hermes_EyeIvory', 'Hermes_IndexCyan', 'Hermes_AnnotationCoral',
    ];
    const requiredAnimations = [
      'Hermes_Idle', 'Hermes_Guiding', 'Hermes_Scanning',
      'Hermes_Suggesting', 'Hermes_AwaitingApproval', 'Hermes_Failed',
    ];

    expect(report.nodeNames).toEqual(expect.arrayContaining(requiredNodes));
    expect(report.nodeNames).not.toContain('Hermes_TempleLens');
    expect([...report.materialNames].sort()).toEqual([...requiredMaterials].sort());
    expect([...report.animationNames].sort()).toEqual([...requiredAnimations].sort());
    expect(report.generator).toContain('OpenScience Hermes');
    expect(report.sceneExtras).toEqual([{
      asset_license: 'Original OpenScience Hermes asset',
      asset_owner: 'OpenScience',
      asset_role: 'scholarly agent navigator',
    }]);
    expect(report.byteLength).toBeLessThanOrEqual(1_800_000);
    expect(report.gzipByteLength).toBeLessThanOrEqual(700_000);
    expect(report.triangleCount).toBeLessThanOrEqual(24_000);
    expect(report.materialNames).toHaveLength(6);
    expect(report.primitiveCount).toBeLessThanOrEqual(12);
    expect(report.animationDurations).toMatchObject({
      Hermes_AwaitingApproval: expect.closeTo(1 / 30, 4),
      Hermes_Failed: expect.closeTo(71 / 30, 4),
      Hermes_Guiding: expect.closeTo(83 / 30, 4),
      Hermes_Idle: expect.closeTo(191 / 30, 4),
      Hermes_Scanning: expect.closeTo(95 / 30, 4),
      Hermes_Suggesting: expect.closeTo(107 / 30, 4),
    });
    expect(report.animationStable.Hermes_AwaitingApproval).toBe(true);
    expect(report.materialFacts.Hermes_BoneCeramic.roughnessFactor).toBeGreaterThanOrEqual(.64);
    expect(report.materialFacts.Hermes_BoneCeramic.roughnessFactor).toBeLessThanOrEqual(.74);
    report.materialFacts.Hermes_EyeIvory.baseColorFactor.slice(0, 3).forEach((value: number, index: number) => {
      expect(value).toBeCloseTo([.82, .78, .68][index], 5);
    });
    report.materialFacts.Hermes_EyeIvory.emissiveFactor.forEach((value: number, index: number) => {
      expect(value).toBeCloseTo([.42, .38, .28][index], 5);
    });
  });

  it('parses the JSON chunk of a GLB 2.0 asset for release evidence', async () => {
    const { parseHermesGlb } = await import('../scripts/hermes/inspect-hermes-glb.mjs');
    const document = {
      asset: { version: '2.0', generator: 'OpenScience Hermes asset test' },
      nodes: [{ name: 'Hermes_Root' }],
      meshes: [],
      materials: [{ name: 'Hermes_BoneCeramic' }],
      animations: [{ name: 'Hermes_Idle', samplers: [], channels: [] }],
    };
    const json = Buffer.from(JSON.stringify(document));
    const paddedLength = Math.ceil(json.length / 4) * 4;
    const buffer = Buffer.alloc(12 + 8 + paddedLength, 0x20);
    buffer.writeUInt32LE(0x46546c67, 0);
    buffer.writeUInt32LE(2, 4);
    buffer.writeUInt32LE(buffer.length, 8);
    buffer.writeUInt32LE(paddedLength, 12);
    buffer.writeUInt32LE(0x4e4f534a, 16);
    json.copy(buffer, 20);

    expect(parseHermesGlb(buffer)).toMatchObject({
      animationNames: ['Hermes_Idle'],
      generator: 'OpenScience Hermes asset test',
      materialNames: ['Hermes_BoneCeramic'],
      nodeNames: ['Hermes_Root'],
      version: 2,
    });
  });
});
