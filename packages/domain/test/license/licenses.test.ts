import { describe, expect, it } from 'vitest';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { createResearchObject } from '../../src/research-object/research-objects';
import { setLicenses, getEffectiveLicenses, setVersionLicenses, validateLicenseInheritance, type Licenses } from '../../src/license/licenses';
import { LICENSE_CATALOG, LICENSE_TYPES } from '../../src/license/catalog';
import { LicenseError } from '../../src/license/errors';

const FULL: Licenses = { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' };

async function makeRo() {
  const { prisma, db } = createFakePrisma();
  const owner = seedUser(db, { id: 'lic-owner' });
  const ws = { id: 'ws-1', type: 'team', name: 'Lab', status: 'active', ownerId: owner.id, createdAt: new Date(), updatedAt: new Date() };
  db.workspaces.push(ws);
  db.memberships.push({ id: 'm-1', workspaceId: 'ws-1', userId: owner.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  const deps = { prisma, mailer: {} as never };
  const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: owner.id, title: 'RO' });
  return { prisma, db, owner, deps, ro };
}

describe('LICENSE_CATALOG 完整性（§6.3 三类）', () => {
  it('text 3 / code 4 / data 4', () => {
    expect(LICENSE_TYPES).toEqual(['text', 'code', 'data']);
    expect(LICENSE_CATALOG.text.map((l) => l.id)).toEqual(['CC-BY-4.0', 'CC-BY-NC-4.0', 'ALL-RIGHTS-RESERVED']);
    expect(LICENSE_CATALOG.code.map((l) => l.id)).toEqual(['MIT', 'Apache-2.0', 'GPL-3.0', 'PROPRIETARY']);
    expect(LICENSE_CATALOG.data.map((l) => l.id)).toEqual(['CC0-1.0', 'CC-BY-4.0', 'CUSTOM', 'NO-DOWNLOAD']);
  });
});

describe('setLicenses（Q1 RO 级全量 + 幂等）', () => {
  it('成员设置三类成功 + 幂等重放不重复记录', async () => {
    const { deps, owner, ro } = await makeRo();
    const rows = await setLicenses(deps, { researchObjectId: ro.id, userId: owner.id, licenses: FULL });
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.versionScoped)).toEqual([false, false, false]);

    // 幂等：重放同值 → 仍 3 行（不重复）
    await setLicenses(deps, { researchObjectId: ro.id, userId: owner.id, licenses: FULL });
    const again = await getEffectiveLicenses(deps, { researchObjectId: ro.id, userId: owner.id });
    expect(again.licenses).toEqual(FULL);
    expect(again.source).toBe('ro');
  });

  it('目录外标识 → INVALID_LICENSE_ID', async () => {
    const { deps, owner, ro } = await makeRo();
    await expect(
      setLicenses(deps, { researchObjectId: ro.id, userId: owner.id, licenses: { ...FULL, code: 'BSD-NOPE' } }),
    ).rejects.toThrow(LicenseError);
  });

  it('非成员设置 → 404（§17 越权）', async () => {
    const { deps, db, ro } = await makeRo();
    const outsider = seedUser(db, { id: 'lic-outsider' });
    await expect(
      setLicenses(deps, { researchObjectId: ro.id, userId: outsider.id, licenses: FULL }),
    ).rejects.toThrow(/空间不存在/);
  });
});

describe('已公开版本不可变（§6.3）', () => {
  it('published 版本 → VERSION_PUBLISHED 拒绝', async () => {
    const { deps, db, owner, ro } = await makeRo();
    // 手动造 version（fake 直接构造 published）
    db.versions.push({ id: 'v-pub', researchObjectId: ro.id, versionNo: 1, status: 'published', commitId: 'c-1', createdAt: new Date() });
    await expect(
      setVersionLicenses(deps, { researchObjectId: ro.id, userId: owner.id, versionId: 'v-pub', licenses: FULL }),
    ).rejects.toThrow(/已公开版本/);
  });

  it('draft 版本 → 允许设置，且覆盖 RO 级生效', async () => {
    const { deps, db, owner, ro } = await makeRo();
    await setLicenses(deps, { researchObjectId: ro.id, userId: owner.id, licenses: FULL });
    db.versions.push({ id: 'v-draft', researchObjectId: ro.id, versionNo: 1, status: 'draft', commitId: 'c-1', createdAt: new Date() });
    await setVersionLicenses(deps, {
      researchObjectId: ro.id, userId: owner.id, versionId: 'v-draft',
      licenses: { ...FULL, code: 'GPL-3.0' },
    });
    const eff = await getEffectiveLicenses(deps, { researchObjectId: ro.id, userId: owner.id, versionId: 'v-draft' });
    expect(eff.licenses?.code).toBe('GPL-3.0');
    expect(eff.source).toBe('version');
  });
});

describe('validateLicenseInheritance（Q4 全矩阵，§8.1 底座）', () => {
  it('相同许可 → ok', () => {
    const r = validateLicenseInheritance(FULL, FULL);
    expect(r.ok).toBe(true);
    expect(r.violations).toHaveLength(0);
  });

  it('可加严 → ok', () => {
    // CC-BY → CC-BY-NC（text 加严）；CC0 → CC-BY（data 加严）；MIT → GPL（code 加严）
    const r = validateLicenseInheritance(FULL, { text: 'CC-BY-NC-4.0', code: 'GPL-3.0', data: 'CC-BY-4.0' });
    expect(r.ok).toBe(true);
  });

  it('不可放宽 → violation', () => {
    // CC-BY-NC → CC-BY（去 NC 放宽）拒绝；GPL → MIT（copyleft 放宽）拒绝
    const r = validateLicenseInheritance(
      { text: 'CC-BY-NC-4.0', code: 'GPL-3.0', data: 'CC0-1.0' },
      { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' },
    );
    expect(r.ok).toBe(false);
    expect(r.violations.map((v) => v.type)).toEqual(expect.arrayContaining(['text', 'code']));
  });

  it('ALL-RIGHTS-RESERVED → 仅同值', () => {
    const r = validateLicenseInheritance(
      { text: 'ALL-RIGHTS-RESERVED', code: 'MIT', data: 'CC0-1.0' },
      { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' },
    );
    expect(r.ok).toBe(false);
  });

  it('NO-DOWNLOAD / CUSTOM → 仅同值（条款不可推断）', () => {
    const r = validateLicenseInheritance(
      { text: 'CC-BY-4.0', code: 'MIT', data: 'NO-DOWNLOAD' },
      { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0-1.0' },
    );
    expect(r.ok).toBe(false);
  });

  it('public 匿名可读许可（§4.2 继承）', async () => {
    const { deps, owner, ro } = await makeRo();
    await setLicenses(deps, { researchObjectId: ro.id, userId: owner.id, licenses: FULL });
    // 直接 DB 置 public（扩大走 P1B-7 审批，测试绕过）
    await deps.prisma.researchObject.update({ where: { id: ro.id }, data: { visibility: 'public' } });
    const eff = await getEffectiveLicenses(deps, { researchObjectId: ro.id });
    expect(eff.licenses).toEqual(FULL);
  });
});
