import type { AuditContext, AuditEvent } from '@openscience/observability';
import { requireMembership } from '../workspace/helpers';
import { canAccessRo } from '../visibility/access';
import type { WorkspaceDeps } from '../workspace/types';
import { LicenseError } from './errors';
import { assertValidLicenseId, LICENSE_TYPES, type LicenseType } from './catalog';

/** 三类许可集合（§5.3 manifest.licenses 结构对齐）。 */
export interface Licenses {
  text: string;
  code: string;
  data: string;
}

export interface LicenseAssignmentView {
  type: LicenseType;
  licenseId: string;
  /** true = 版本级（versionId≠null）；false = RO 级（§6.3） */
  versionScoped: boolean;
}

export interface LicenseInheritanceViolation {
  type: LicenseType;
  source: string;
  target: string;
  reason: string;
}

export interface LicenseInheritanceResult {
  ok: boolean;
  violations: LicenseInheritanceViolation[];
}

/** 非事务审计写（deps.audit 缺省 no-op）。 */
function audit(deps: WorkspaceDeps, event: Omit<AuditEvent, 'requestId' | 'ip'>, ctx: AuditContext): void {
  void deps.audit?.record({ ...event, requestId: ctx.requestId, ip: ctx.ip });
}

function assertLicenses(l: Licenses): void {
  assertValidLicenseId(l.text);
  assertValidLicenseId(l.code);
  assertValidLicenseId(l.data);
}

function mapView(row: { licenseType: string; licenseId: string; versionId: string | null }): LicenseAssignmentView {
  return { type: row.licenseType as LicenseType, licenseId: row.licenseId, versionScoped: row.versionId !== null };
}

function viewsToLicenses(views: LicenseAssignmentView[]): Licenses | null {
  const byType = new Map(views.map((v) => [v.type, v.licenseId]));
  const text = byType.get('text');
  const code = byType.get('code');
  const data = byType.get('data');
  if (!text || !code || !data) return null; // 三类未选齐 → 无有效许可（§6.3 发布前必选）
  return { text, code, data };
}

/**
 * 设置 RO 级三类许可（§6.3 + §2.2 决策 6）：
 * - 写权限 requireMembership（§17 越权）
 * - 全量 upsert（@@unique([roId, null, type]) 天然幂等，Q1 决策）
 * - 审计 license.upsert
 */
export async function setLicenses(
  deps: WorkspaceDeps,
  input: { researchObjectId: string; userId: string; licenses: Licenses },
  ctx: AuditContext = {},
): Promise<LicenseAssignmentView[]> {
  assertLicenses(input.licenses);
  const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } });
  if (!ro) throw new LicenseError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  await requireMembership(deps, ro.workspaceId, input.userId);

  const rows: LicenseAssignmentView[] = [];
  for (const type of LICENSE_TYPES) {
    // 复合唯一键含 null（RO 级）Prisma upsert where 不接受 → findFirst + update/create（Q1 幂等）
    const existing = await deps.prisma.licenseAssignment.findFirst({
      where: { researchObjectId: ro.id, versionId: null, licenseType: type },
    });
    const row = existing
      ? await deps.prisma.licenseAssignment.update({ where: { id: existing.id }, data: { licenseId: input.licenses[type] } })
      : await deps.prisma.licenseAssignment.create({
          data: { researchObjectId: ro.id, versionId: null, licenseType: type, licenseId: input.licenses[type] },
        });
    rows.push(mapView(row));
  }
  audit(deps, {
    actorId: input.userId, action: 'license.upsert', workspaceId: ro.workspaceId,
    targetType: 'research_object', targetId: ro.id,
    metadata: { researchObjectId: ro.id, versionId: null, licenses: input.licenses },
  }, ctx);
  return rows;
}

/**
 * 有效许可读取（§5.3 manifest.licenses）：版本级优先，回退 RO 级。
 * 读权限 canAccessRo（public 匿名可读，§4.2）。
 */
export async function getEffectiveLicenses(
  deps: WorkspaceDeps,
  input: { researchObjectId: string; userId?: string; versionId?: string },
): Promise<{ licenses: Licenses | null; source: 'version' | 'ro' | 'none' }> {
  const access = await canAccessRo(deps, { researchObjectId: input.researchObjectId, userId: input.userId });
  if (access === 'denied') throw new LicenseError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');

  if (input.versionId) {
    const versionRows = await deps.prisma.licenseAssignment.findMany({
      where: { researchObjectId: input.researchObjectId, versionId: input.versionId },
    });
    const versionLicenses = viewsToLicenses(versionRows.map(mapView));
    if (versionLicenses) return { licenses: versionLicenses, source: 'version' };
  }
  const roRows = await deps.prisma.licenseAssignment.findMany({
    where: { researchObjectId: input.researchObjectId, versionId: null },
  });
  const roLicenses = viewsToLicenses(roRows.map(mapView));
  if (roLicenses) return { licenses: roLicenses, source: 'ro' };
  return { licenses: null, source: 'none' };
}

/**
 * 设置版本级许可（§6.3 不可追溯覆盖已公开版本）：
 * - 已公开版本（status=published）→ VERSION_PUBLISHED 拒绝
 * - 未公开版本 → upsert 版本级（覆盖 RO 级生效）
 * P1D-8 发布事务将 RO 级快照落版本级。
 */
export async function setVersionLicenses(
  deps: WorkspaceDeps,
  input: { researchObjectId: string; userId: string; versionId: string; licenses: Licenses },
  ctx: AuditContext = {},
): Promise<LicenseAssignmentView[]> {
  assertLicenses(input.licenses);
  const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } });
  if (!ro) throw new LicenseError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  await requireMembership(deps, ro.workspaceId, input.userId);

  const version = await deps.prisma.version.findFirst({ where: { id: input.versionId, researchObjectId: ro.id } });
  if (!version) throw new LicenseError('VALIDATION_ERROR', '版本不存在');
  if (version.status === 'published') {
    throw new LicenseError('VERSION_PUBLISHED', '已公开版本的许可不可修改（§6.3），仅对新版本生效');
  }

  const rows: LicenseAssignmentView[] = [];
  for (const type of LICENSE_TYPES) {
    // 复合唯一键含 versionId → findFirst + update/create（Q1 幂等）
    const existing = await deps.prisma.licenseAssignment.findFirst({
      where: { researchObjectId: ro.id, versionId: input.versionId, licenseType: type },
    });
    const row = existing
      ? await deps.prisma.licenseAssignment.update({ where: { id: existing.id }, data: { licenseId: input.licenses[type] } })
      : await deps.prisma.licenseAssignment.create({
          data: { researchObjectId: ro.id, versionId: input.versionId, licenseType: type, licenseId: input.licenses[type] },
        });
    rows.push(mapView(row));
  }
  audit(deps, {
    actorId: input.userId, action: 'license.upsert', workspaceId: ro.workspaceId,
    targetType: 'version', targetId: input.versionId,
    metadata: { researchObjectId: ro.id, versionId: input.versionId, licenses: input.licenses },
  }, ctx);
  return rows;
}

/**
 * 继承校验（§6.3 Fork/再利用 + §8.1 来源许可继承验证，P1C-5/P1C-6 调用）。
 * 纯函数：source（来源 RO 许可）→ target（Fork/PR 目标许可）兼容性矩阵。
 * 原则：可加严，拒绝放宽或不可推断。
 */
export function validateLicenseInheritance(
  source: Licenses,
  target: Licenses,
): LicenseInheritanceResult {
  const violations: LicenseInheritanceViolation[] = [];

  // 兼容矩阵：key = `${type}:${sourceId}` → 允许的 target 集合
  const ALLOWED: Record<string, Set<string>> = {
    // text
    'text:ALL-RIGHTS-RESERVED': new Set(['ALL-RIGHTS-RESERVED']),
    'text:CC-BY-NC-4.0': new Set(['CC-BY-NC-4.0', 'ALL-RIGHTS-RESERVED']),
    'text:CC-BY-4.0': new Set(['CC-BY-4.0', 'CC-BY-NC-4.0', 'ALL-RIGHTS-RESERVED']),
    // code
    'code:PROPRIETARY': new Set(['PROPRIETARY']),
    'code:GPL-3.0': new Set(['GPL-3.0', 'PROPRIETARY']),
    'code:MIT': new Set(['MIT', 'Apache-2.0', 'GPL-3.0', 'PROPRIETARY']),
    'code:Apache-2.0': new Set(['MIT', 'Apache-2.0', 'GPL-3.0', 'PROPRIETARY']),
    // data
    'data:NO-DOWNLOAD': new Set(['NO-DOWNLOAD']),
    'data:CUSTOM': new Set(['CUSTOM']),
    'data:CC-BY-4.0': new Set(['CC-BY-4.0', 'CUSTOM', 'NO-DOWNLOAD']),
    'data:CC0-1.0': new Set(['CC0-1.0', 'CC-BY-4.0', 'CUSTOM', 'NO-DOWNLOAD']),
  };

  for (const type of LICENSE_TYPES) {
    const s = source[type];
    const t = target[type];
    const allowed = ALLOWED[`${type}:${s}`];
    if (!allowed) {
      violations.push({ type, source: s, target: t, reason: `未知来源许可 ${s}` });
      continue;
    }
    if (!allowed.has(t)) {
      violations.push({ type, source: s, target: t, reason: `许可不可从 ${s} 放宽至 ${t}` });
    }
  }
  return { ok: violations.length === 0, violations };
}
