import {
  Prisma,
  type Journal,
  type JournalApplication,
  type JournalGrant,
  type JournalServiceRequest,
  type Membership,
  type User,
} from '@prisma/client';
import { now as currentTime, type WorkspaceDeps } from '../workspace/types';
import {
  JOURNAL_SERVICE_OPTIONS, JOURNAL_APPLICATION_REQUIRED_FIELDS, JOURNAL_HOMEPAGE_REQUIRED_FIELDS,
  journalEnglishMetadataIssues, type JournalEnglishMetadata, type JournalEnglishField,
} from './form-contract';
import {
  JOURNAL_TO_WORKSPACE_ROLE,
  JournalError,
  type JournalApplicationDraftInput,
  type JournalApplicationView,
  type JournalOperationalState,
  type JournalPublicDetail,
  type JournalRole,
  type WorkspaceJournalRole,
} from './contracts';

type ApplicationRow = JournalApplication;
type JournalRow = Journal;
type JournalMembershipRow = Membership & { role: WorkspaceJournalRole };
type UserRow = User;
type ServiceRow = JournalServiceRequest;
type JournalDb = Prisma.TransactionClient;

const MAX_TRANSACTION_ATTEMPTS = 3;
const JOURNAL_MEMBER_ROLES = new Set<WorkspaceJournalRole>(['owner', 'maintainer', 'author', 'reviewer']);

function isPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code;
}

async function serializable<T>(deps: WorkspaceDeps, work: (tx: JournalDb) => Promise<T>, retryUnique = false): Promise<T> {
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await deps.prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (attempt < MAX_TRANSACTION_ATTEMPTS && (isPrismaCode(error, 'P2034') || (retryUnique && isPrismaCode(error, 'P2002')))) continue;
      if (isPrismaCode(error, 'P2034')) throw new JournalError('CONCURRENT_CONFLICT', '并发操作冲突，请重试', error);
      throw error;
    }
  }
  throw new JournalError('CONCURRENT_CONFLICT', '并发操作冲突，请重试');
}

async function lockJournal(db: JournalDb, journalId: string): Promise<void> {
  await db.$queryRaw(Prisma.sql`SELECT id FROM journals WHERE id = ${journalId}::uuid FOR UPDATE`);
}

function required(value: string | undefined | null, label: string, max = 500): string {
  const normalized = value?.trim() ?? '';
  if (!normalized || normalized.length > max) throw new JournalError('VALIDATION_ERROR', `${label}不能为空且不得超过 ${max} 字符`);
  return normalized;
}

function optional(value: string | undefined | null, max = 2_000): string | null | undefined {
  if (value === undefined) return undefined;
  const normalized = value?.trim() ?? '';
  if (normalized.length > max) throw new JournalError('VALIDATION_ERROR', `字段不得超过 ${max} 字符`);
  return normalized || null;
}

function httpsUrl(value: string | undefined | null, label: string, optionalValue = false): string | null | undefined {
  if (value === undefined && optionalValue) return undefined;
  const normalized = optionalValue ? optional(value, 2_000) : required(value, label, 2_000);
  if (normalized === null || normalized === undefined) return normalized;
  let parsed: URL;
  try { parsed = new URL(normalized); } catch { throw new JournalError('VALIDATION_ERROR', `${label}必须是有效的 HTTPS 地址`); }
  if (parsed.protocol !== 'https:') throw new JournalError('VALIDATION_ERROR', `${label}必须使用 HTTPS`);
  return parsed.toString();
}

export function normalizeIssn(value: string | undefined | null): string | null {
  if (!value?.trim()) return null;
  const normalized = value.replace(/[\s-]/g, '').toUpperCase();
  if (!/^\d{7}[\dX]$/.test(normalized)) throw new JournalError('VALIDATION_ERROR', 'ISSN 格式无效');
  const sum = [...normalized.slice(0, 7)].reduce((total, digit, index) => total + Number(digit) * (8 - index), 0);
  const remainder = (11 - (sum % 11)) % 11;
  const check = remainder === 10 ? 'X' : String(remainder);
  if (normalized[7] !== check) throw new JournalError('VALIDATION_ERROR', 'ISSN 校验位无效');
  return normalized;
}

function applicationView(row: ApplicationRow): JournalApplicationView {
  return {
    id: row.id, applicantId: row.applicantId, status: row.status, revision: row.revision,
    submittedAt: row.submittedAt, journalId: row.journalId, createdAt: row.createdAt, updatedAt: row.updatedAt,
    reviewReason: row.reviewReason,
    nameZh: row.nameZh, nameEn: row.nameEn, pIssn: row.pIssn, eIssn: row.eIssn,
    websiteUrl: row.websiteUrl, publisherName: row.publisherName, sponsorName: row.sponsorName,
    subjects: row.subjects, description: row.description, logoUrl: row.logoUrl,
    applicantName: row.applicantName, applicantTitle: row.applicantTitle, applicantEmail: row.applicantEmail,
    representationEvidence: row.representationEvidence, plannedArticleCount: row.plannedArticleCount,
    requestedServices: row.requestedServices, rightsDeclaration: row.rightsDeclaration,
    rightsDeclarationVersion: row.rightsDeclarationVersion,
  };
}

function assertEnglishMetadata(input: JournalEnglishMetadata, requiredFields: readonly JournalEnglishField[] = []): void {
  const labels: Record<JournalEnglishField, string> = { nameEn: '英文刊名', publisherName: '出版商', sponsorName: '主办单位', subjects: '学科', description: '期刊简介', applicantName: '申请人姓名', applicantTitle: '申请人职务', representationEvidence: '代表依据说明' };
  const issue = journalEnglishMetadataIssues(input, requiredFields)[0];
  if (issue) throw new JournalError('VALIDATION_ERROR', `${labels[issue.field]}${issue.reason === 'required' ? '为必填项，请用英文填写' : '须用英文填写；人名请使用罗马字母拼写'}`);
}

function serviceSelections(values: string[]): string[] {
  if (values.some((value) => !JOURNAL_SERVICE_OPTIONS.some((option) => option.value === value))) throw new JournalError('VALIDATION_ERROR', '所选服务已停止提供或不存在，请刷新服务选项');
  return [...new Set(values)];
}

function draftData(input: JournalApplicationDraftInput): Record<string, unknown> {
  assertEnglishMetadata(input);
  const data: Record<string, unknown> = {};
  const set = (key: keyof JournalApplicationDraftInput, value: unknown) => { if (input[key] !== undefined) data[key] = value; };
  set('nameZh', optional(input.nameZh, 200)); set('nameEn', optional(input.nameEn, 200));
  set('pIssn', normalizeIssn(input.pIssn)); set('eIssn', normalizeIssn(input.eIssn));
  set('websiteUrl', httpsUrl(input.websiteUrl, '期刊官网', true)); set('publisherName', optional(input.publisherName, 300));
  set('sponsorName', optional(input.sponsorName, 300)); set('description', optional(input.description, 5_000));
  set('logoUrl', httpsUrl(input.logoUrl, 'Logo 地址', true)); set('applicantName', optional(input.applicantName, 100));
  set('applicantTitle', optional(input.applicantTitle, 100)); set('applicantEmail', optional(input.applicantEmail, 320)?.toLowerCase());
  set('representationEvidence', optional(input.representationEvidence, 10_000));
  set('rightsDeclaration', optional(input.rightsDeclaration, 10_000));
  set('rightsDeclarationVersion', optional(input.rightsDeclarationVersion, 100));
  if (input.subjects !== undefined) data.subjects = input.subjects.map((item) => required(item, '学科', 100));
  if (input.requestedServices !== undefined) data.requestedServices = serviceSelections(input.requestedServices);
  if (input.plannedArticleCount !== undefined) {
    if (!Number.isInteger(input.plannedArticleCount) || input.plannedArticleCount < 0) throw new JournalError('VALIDATION_ERROR', '计划导入数量必须是非负整数');
    data.plannedArticleCount = input.plannedArticleCount;
  }
  return data;
}

function validateSubmission(row: ApplicationRow): void {
  assertEnglishMetadata(row, JOURNAL_APPLICATION_REQUIRED_FIELDS);
  if (!row.pIssn && !row.eIssn) throw new JournalError('VALIDATION_ERROR', 'pISSN 或 eISSN 至少填写一项');
  required(row.websiteUrl, '期刊官网'); required(row.publisherName, '出版单位');
  if (!row.subjects?.length) throw new JournalError('VALIDATION_ERROR', '至少填写一个学科');
  required(row.applicantName, '申请人姓名'); required(row.applicantTitle, '申请人职务');
  required(row.applicantEmail, '申请人邮箱'); required(row.representationEvidence, '代表编辑部的依据');
  required(row.rightsDeclaration, '内容使用声明'); required(row.rightsDeclarationVersion, '声明版本');
}

export async function recordJournalEvent(
  db: JournalDb,
  event: { journalId?: string | null; actorId: string; action: string; targetType: string; targetId: string; reason?: string; before?: Prisma.InputJsonValue; after?: Prisma.InputJsonValue },
): Promise<void> {
  await db.journalEvent.create({ data: { journalId: event.journalId ?? null, ...event } });
}

async function requirePlatformAdmin(db: JournalDb, userId: string): Promise<UserRow> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.platformRole !== 'platform_admin') throw new JournalError('FORBIDDEN', '仅平台管理员可执行此操作');
  return user;
}

export async function requireJournalMember(
  db: JournalDb,
  journalId: string,
  userId: string,
  roles: readonly WorkspaceJournalRole[] = [...JOURNAL_MEMBER_ROLES],
  allowInactive = false,
): Promise<{ journal: JournalRow; membership: JournalMembershipRow }> {
  const journal = await db.journal.findUnique({ where: { id: journalId } });
  if (!journal) throw new JournalError('JOURNAL_NOT_FOUND', '期刊不存在');
  const membership = await db.membership.findUnique({ where: { workspaceId_userId: { workspaceId: journal.workspaceId, userId } } });
  if (!membership || !roles.includes(membership.role as WorkspaceJournalRole)) throw new JournalError('JOURNAL_NOT_FOUND', '期刊不存在');
  if (!allowInactive && journal.operationalState !== 'active') throw new JournalError('INVALID_STATE', '期刊当前不可执行新增或发布操作');
  return { journal, membership: membership as JournalMembershipRow };
}

export async function saveJournalApplication(deps: WorkspaceDeps, userId: string, input: JournalApplicationDraftInput): Promise<JournalApplicationView> {
  return serializable(deps, async (tx) => {
    const data = draftData(input);
    if (!input.applicationId) {
      const row = await tx.journalApplication.create({ data: { applicantId: userId, ...data } });
      return applicationView(row);
    }
    const row = await tx.journalApplication.findUnique({ where: { id: input.applicationId } });
    if (!row || row.applicantId !== userId) throw new JournalError('APPLICATION_NOT_FOUND', '申请不存在');
    if (!['draft', 'needs_information'].includes(row.status)) throw new JournalError('INVALID_STATE', '当前申请状态不可修改');
    if (input.revision !== row.revision) throw new JournalError('REVISION_CONFLICT', '申请已更新，请刷新后重试');
    const updated = await tx.journalApplication.update({ where: { id: row.id }, data: { ...data, revision: { increment: 1 } } });
    return applicationView(updated);
  });
}

export async function listMyJournalApplications(deps: WorkspaceDeps, userId: string): Promise<JournalApplicationView[]> {
  const rows = await deps.prisma.journalApplication.findMany({ where: { applicantId: userId }, orderBy: { updatedAt: 'desc' } });
  return rows.map(applicationView);
}

export async function submitJournalApplication(
  deps: WorkspaceDeps,
  userId: string,
  input: { applicationId: string; revision: number; submissionKey: string },
): Promise<JournalApplicationView> {
  try {
    return await serializable(deps, async (tx) => {
      const row = await tx.journalApplication.findUnique({ where: { id: input.applicationId } });
      if (!row || row.applicantId !== userId) throw new JournalError('APPLICATION_NOT_FOUND', '申请不存在');
      if (row.status === 'submitted' && row.submissionKey === input.submissionKey) return applicationView(row);
      const reusedKey = await tx.journalApplication.findUnique({ where: { submissionKey: input.submissionKey } });
      if (reusedKey && reusedKey.id !== row.id) throw new JournalError('IDEMPOTENCY_CONFLICT', '提交键已用于其他申请');
      if (!['draft', 'needs_information'].includes(row.status)) throw new JournalError('INVALID_STATE', '当前申请状态不可提交');
      if (row.revision !== input.revision) throw new JournalError('REVISION_CONFLICT', '申请已更新，请刷新后重试');
      serviceSelections(row.requestedServices);
      validateSubmission(row);
      const applicant = await tx.user.findUnique({ where: { id: userId } });
      if (!applicant || !['email_verified', 'identity_verified'].includes(applicant.status)) throw new JournalError('FORBIDDEN', '当前账号须先完成邮箱验证');
      if (applicant.email.trim().toLowerCase() !== row.applicantEmail?.trim().toLowerCase()) throw new JournalError('VALIDATION_ERROR', '申请人邮箱必须使用当前登录账号的已验证邮箱');
      const identifiers = [...new Set([row.pIssn, row.eIssn].filter((value): value is string => Boolean(value)))];
      await tx.journalIdentifier.deleteMany({ where: { applicationId: row.id, journalId: null } });
      for (const value of identifiers) {
        await tx.journalIdentifier.create({ data: { value, type: value === row.pIssn ? 'print' : 'electronic', applicationId: row.id } });
      }
      const updated = await tx.journalApplication.update({ where: { id: row.id }, data: { status: 'submitted', submissionKey: input.submissionKey, submittedAt: currentTime(deps), revision: { increment: 1 }, reviewReason: null } });
      await recordJournalEvent(tx, { actorId: userId, action: 'journal.application.submit', targetType: 'journal_application', targetId: row.id, after: { revision: updated.revision } });
      return applicationView(updated);
    });
  } catch (error) {
    if (isPrismaCode(error, 'P2002')) throw new JournalError('ISSN_CONFLICT', '该 ISSN 已有关联期刊或待核验申请', error);
    throw error;
  }
}

export async function listAdminApplications(deps: WorkspaceDeps, adminId: string, status?: JournalApplicationView['status']): Promise<JournalApplicationView[]> {
  const db = deps.prisma; await requirePlatformAdmin(db, adminId);
  const rows = await db.journalApplication.findMany({ where: status ? { status } : {}, orderBy: { submittedAt: 'asc' } });
  return rows.map(applicationView);
}

export async function requestJournalApplicationRevision(deps: WorkspaceDeps, adminId: string, input: { applicationId: string; reason: string; internalNotes?: string }): Promise<JournalApplicationView> {
  return serializable(deps, async (tx) => {
    await requirePlatformAdmin(tx, adminId);
    const row = await tx.journalApplication.findUnique({ where: { id: input.applicationId } });
    if (!row) throw new JournalError('APPLICATION_NOT_FOUND', '申请不存在');
    if (row.status !== 'submitted') throw new JournalError('INVALID_STATE', '只有已提交申请可以要求补件');
    const updated = await tx.journalApplication.update({ where: { id: row.id }, data: { status: 'needs_information', reviewReason: required(input.reason, '补件原因', 2_000), internalNotes: optional(input.internalNotes), reviewedBy: adminId, reviewedAt: currentTime(deps), revision: { increment: 1 } } });
    await recordJournalEvent(tx, { actorId: adminId, action: 'journal.application.needs_information', targetType: 'journal_application', targetId: row.id, reason: input.reason });
    return applicationView(updated);
  });
}

export async function reopenJournalApplication(
  deps: WorkspaceDeps,
  adminId: string,
  input: { applicationId: string; expectedRevision: number; reason: string },
): Promise<JournalApplicationView> {
  return serializable(deps, async (tx) => {
    await requirePlatformAdmin(tx, adminId);
    const reason = required(input.reason, '更正原因', 2_000);
    const row = await tx.journalApplication.findUnique({ where: { id: input.applicationId } });
    if (!row) throw new JournalError('APPLICATION_NOT_FOUND', '申请不存在');
    if (row.status !== 'rejected' || row.journalId) throw new JournalError('INVALID_STATE', '只有已拒绝且未入驻的申请可以更正为退回修改');
    if (row.revision !== input.expectedRevision) throw new JournalError('REVISION_CONFLICT', '申请已更新，请刷新后重试');
    // Keep the applicant's original review instructions and all submitted metadata.
    const updated = await tx.journalApplication.update({ where: { id: row.id }, data: {
      status: 'needs_information', reviewedBy: adminId, reviewedAt: currentTime(deps), revision: { increment: 1 },
    } });
    await recordJournalEvent(tx, {
      actorId: adminId, action: 'journal.application.reopened', targetType: 'journal_application', targetId: row.id, reason,
      before: { status: row.status, revision: row.revision, reviewReason: row.reviewReason, reviewedBy: row.reviewedBy, reviewedAt: row.reviewedAt?.toISOString() ?? null },
      after: { status: updated.status, revision: updated.revision },
    });
    return applicationView(updated);
  });
}

function slugValue(value: string): string {
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) throw new JournalError('VALIDATION_ERROR', 'slug 只能包含小写字母、数字和连字符');
  return slug;
}

export async function verifyJournalApplication(
  deps: WorkspaceDeps,
  adminId: string,
  input: { applicationId: string; decision: 'approved' | 'rejected' | 'needs_information'; reason?: string; internalNotes?: string; slug?: string },
): Promise<{ application: JournalApplicationView; journal: JournalRow | null }> {
  try {
    return await serializable(deps, async (tx) => {
      await requirePlatformAdmin(tx, adminId);
      const row = await tx.journalApplication.findUnique({ where: { id: input.applicationId } });
      if (!row) throw new JournalError('APPLICATION_NOT_FOUND', '申请不存在');
      if (row.status === 'approved' && row.journalId) {
        if (input.decision !== 'approved') throw new JournalError('INVALID_STATE', '已通过申请不能改为其他核验结论');
        return { application: applicationView(row), journal: await tx.journal.findUnique({ where: { id: row.journalId } }) };
      }
      if (row.status !== 'submitted') throw new JournalError('INVALID_STATE', '只有已提交申请可以核验');
      if (input.decision !== 'approved') {
        const reason = required(input.reason, '审核原因', 2_000);
        const updated = await tx.journalApplication.update({ where: { id: row.id }, data: { status: input.decision, reviewReason: reason, internalNotes: optional(input.internalNotes), reviewedBy: adminId, reviewedAt: currentTime(deps), revision: { increment: 1 } } });
        await recordJournalEvent(tx, { actorId: adminId, action: `journal.application.${input.decision}`, targetType: 'journal_application', targetId: row.id, reason });
        return { application: applicationView(updated), journal: null };
      }
      validateSubmission(row);
      const verifiedAt = currentTime(deps);
      const displayName = required(row.nameEn, '英文刊名', 200);
      const workspace = await tx.workspace.create({ data: { type: 'team', name: displayName, ownerId: row.applicantId, members: { create: { userId: row.applicantId, role: 'owner' } } } });
      const slug = slugValue(required(input.slug, 'slug', 80));
      if (await tx.journal.findUnique({ where: { slug } })) throw new JournalError('SLUG_CONFLICT', '期刊主页地址已被占用');
      const journal = await tx.journal.create({ data: { workspaceId: workspace.id, slug, nameZh: row.nameZh, nameEn: row.nameEn, websiteUrl: required(row.websiteUrl, '期刊官网', 2_000), publisherName: required(row.publisherName, '出版单位', 300), sponsorName: row.sponsorName, subjects: row.subjects, description: row.description, logoUrl: row.logoUrl, verifiedAt } });
      await tx.journalIdentifier.updateMany({ where: { applicationId: row.id }, data: { journalId: journal.id } });
      const trialKey = `trial:${journal.id}`;
      const trial = await tx.journalGrant.create({ data: { journalId: journal.id, amount: 5, remaining: 5, expiresAt: new Date(verifiedAt.getTime() + 90 * 24 * 60 * 60 * 1_000), grantKey: trialKey, reason: 'first_verified_journal_trial' } });
      await tx.journalLedger.create({ data: { journalId: journal.id, grantId: trial.id, kind: 'grant', amount: 5, eventKey: trialKey } });
      const updated = await tx.journalApplication.update({ where: { id: row.id }, data: { status: 'approved', journalId: journal.id, reviewReason: null, internalNotes: optional(input.internalNotes), reviewedBy: adminId, reviewedAt: verifiedAt, revision: { increment: 1 } } });
      await recordJournalEvent(tx, { journalId: journal.id, actorId: adminId, action: 'journal.verify', targetType: 'journal', targetId: journal.id, after: { workspaceId: workspace.id, trialCredits: 5 } });
      return { application: applicationView(updated), journal };
    }, true);
  } catch (error) {
    if (isPrismaCode(error, 'P2002')) throw new JournalError('CONCURRENT_CONFLICT', '核验并发冲突，请重试', error);
    throw error;
  }
}

export async function listManagedJournals(deps: WorkspaceDeps, userId: string): Promise<Array<JournalRow & { role: WorkspaceJournalRole }>> {
  const db = deps.prisma; const memberships = await db.membership.findMany({ where: { userId, role: { in: [...JOURNAL_MEMBER_ROLES] } } });
  const result: Array<JournalRow & { role: WorkspaceJournalRole }> = [];
  for (const membership of memberships) {
    const journal = await db.journal.findUnique({ where: { workspaceId: membership.workspaceId } });
    if (journal && JOURNAL_MEMBER_ROLES.has(membership.role as WorkspaceJournalRole)) result.push({ ...journal, role: membership.role as WorkspaceJournalRole });
  }
  return result;
}

export async function updateJournalHomepage(deps: WorkspaceDeps, userId: string, journalId: string, input: { revision: number; nameZh?: string; nameEn?: string; websiteUrl?: string; publisherName?: string; sponsorName?: string; subjects?: string[]; description?: string; logoUrl?: string }): Promise<JournalRow> {
  return serializable(deps, async (tx) => {
    await lockJournal(tx, journalId);
    const { journal } = await requireJournalMember(tx, journalId, userId, ['owner', 'maintainer'], true);
    if (journal.operationalState === 'closed') throw new JournalError('INVALID_STATE', '已关闭期刊须重新核验后修改');
    if (journal.revision !== input.revision) throw new JournalError('REVISION_CONFLICT', '期刊资料已更新，请刷新后重试');
    assertEnglishMetadata({ ...journal, ...input }, JOURNAL_HOMEPAGE_REQUIRED_FIELDS);
    const data: Record<string, unknown> = {};
    if (input.nameZh !== undefined) data.nameZh = optional(input.nameZh, 200);
    if (input.nameEn !== undefined) data.nameEn = optional(input.nameEn, 200);
    if (input.websiteUrl !== undefined) data.websiteUrl = httpsUrl(input.websiteUrl, '期刊官网');
    if (input.publisherName !== undefined) data.publisherName = required(input.publisherName, '出版单位', 300);
    if (input.sponsorName !== undefined) data.sponsorName = optional(input.sponsorName, 300);
    if (input.subjects !== undefined) data.subjects = input.subjects.map((item) => required(item, '学科', 100));
    if (input.description !== undefined) data.description = optional(input.description, 5_000);
    if (input.logoUrl !== undefined) data.logoUrl = httpsUrl(input.logoUrl, 'Logo 地址', true);
    const updated = await tx.journal.update({ where: { id: journalId }, data: { ...data, revision: { increment: 1 } } });
    await recordJournalEvent(tx, { journalId, actorId: userId, action: 'journal.homepage.update', targetType: 'journal', targetId: journalId, before: { revision: journal.revision }, after: { revision: updated.revision } });
    return updated;
  });
}

export async function activateJournalHomepage(deps: WorkspaceDeps, userId: string, journalId: string): Promise<JournalRow> {
  return serializable(deps, async (tx) => {
    await lockJournal(tx, journalId); const { journal } = await requireJournalMember(tx, journalId, userId, ['owner', 'maintainer']);
    assertEnglishMetadata(journal, JOURNAL_HOMEPAGE_REQUIRED_FIELDS);
    const updated = journal.homepagePublished ? journal : await tx.journal.update({ where: { id: journalId }, data: { homepagePublished: true, revision: { increment: 1 } } });
    if (!journal.homepagePublished) await recordJournalEvent(tx, { journalId, actorId: userId, action: 'journal.homepage.activate', targetType: 'journal', targetId: journalId });
    return updated;
  });
}

export async function listJournalMembers(deps: WorkspaceDeps, userId: string, journalId: string): Promise<Array<{ userId: string; email: string; displayName: string; role: WorkspaceJournalRole; joinedAt: Date }>> {
  const db = deps.prisma; const { journal } = await requireJournalMember(db, journalId, userId, undefined, true);
  const rows = await db.membership.findMany({ where: { workspaceId: journal.workspaceId } });
  const result: Array<{ userId: string; email: string; displayName: string; role: WorkspaceJournalRole; joinedAt: Date }> = [];
  for (const membership of rows) { const user = await db.user.findUnique({ where: { id: membership.userId } }); if (JOURNAL_MEMBER_ROLES.has(membership.role as WorkspaceJournalRole)) result.push({ userId: membership.userId, email: user?.email ?? '', displayName: user?.displayName ?? '', role: membership.role as WorkspaceJournalRole, joinedAt: membership.createdAt }); }
  return result;
}

function assertCanManageMember(actor: WorkspaceJournalRole, target: WorkspaceJournalRole): void {
  if (actor === 'owner') return;
  if (actor === 'maintainer' && ['author', 'reviewer'].includes(target)) return;
  throw new JournalError('FORBIDDEN', '管理员只能管理编辑和审核人');
}

export async function addJournalMember(deps: WorkspaceDeps, userId: string, journalId: string, input: { targetUserId: string; role: JournalRole }): Promise<void> {
  await serializable(deps, async (tx) => {
    await lockJournal(tx, journalId); const { journal, membership } = await requireJournalMember(tx, journalId, userId, ['owner', 'maintainer']);
    const role = JOURNAL_TO_WORKSPACE_ROLE[input.role]; assertCanManageMember(membership.role, role);
    const targetUser = await tx.user.findUnique({ where: { id: input.targetUserId } });
    if (!targetUser || !['email_verified', 'identity_verified'].includes(targetUser.status)) throw new JournalError('VALIDATION_ERROR', '目标用户须已验证且账号状态正常');
    if (await tx.membership.findUnique({ where: { workspaceId_userId: { workspaceId: journal.workspaceId, userId: input.targetUserId } } })) throw new JournalError('INVALID_STATE', '用户已是期刊成员');
    await tx.membership.create({ data: { workspaceId: journal.workspaceId, userId: input.targetUserId, role } });
    await recordJournalEvent(tx, { journalId, actorId: userId, action: 'journal.member.add', targetType: 'user', targetId: input.targetUserId, after: { role } });
  });
}

export async function changeJournalMemberRole(deps: WorkspaceDeps, userId: string, journalId: string, input: { targetUserId: string; role: JournalRole }): Promise<void> {
  await serializable(deps, async (tx) => {
    await lockJournal(tx, journalId); const { journal, membership } = await requireJournalMember(tx, journalId, userId, ['owner', 'maintainer'], true);
    if (journal.operationalState === 'closed') throw new JournalError('INVALID_STATE', '期刊已关闭');
    const target = await tx.membership.findUnique({ where: { workspaceId_userId: { workspaceId: journal.workspaceId, userId: input.targetUserId } } });
    if (!target) throw new JournalError('JOURNAL_NOT_FOUND', '成员不存在');
    const role = JOURNAL_TO_WORKSPACE_ROLE[input.role]; assertCanManageMember(membership.role, target.role as WorkspaceJournalRole); assertCanManageMember(membership.role, role);
    if (target.role === 'owner' && role !== 'owner' && await tx.membership.count({ where: { workspaceId: journal.workspaceId, role: 'owner' } }) <= 1) throw new JournalError('LAST_OWNER', '期刊至少保留一位负责人');
    await tx.membership.update({ where: { id: target.id }, data: { role } });
    await recordJournalEvent(tx, { journalId, actorId: userId, action: 'journal.member.change_role', targetType: 'user', targetId: target.userId, before: { role: target.role }, after: { role } });
  });
}

export async function removeJournalMember(deps: WorkspaceDeps, userId: string, journalId: string, targetUserId: string): Promise<void> {
  await serializable(deps, async (tx) => {
    await lockJournal(tx, journalId); const { journal, membership } = await requireJournalMember(tx, journalId, userId, ['owner', 'maintainer'], true);
    const target = await tx.membership.findUnique({ where: { workspaceId_userId: { workspaceId: journal.workspaceId, userId: targetUserId } } });
    if (!target) throw new JournalError('JOURNAL_NOT_FOUND', '成员不存在'); assertCanManageMember(membership.role, target.role as WorkspaceJournalRole);
    if (target.role === 'owner' && await tx.membership.count({ where: { workspaceId: journal.workspaceId, role: 'owner' } }) <= 1) throw new JournalError('LAST_OWNER', '不能移除最后一位负责人');
    await tx.membership.delete({ where: { id: target.id } });
    await recordJournalEvent(tx, { journalId, actorId: userId, action: 'journal.member.remove', targetType: 'user', targetId: targetUserId, before: { role: target.role } });
  });
}

export async function transferJournalOwnership(deps: WorkspaceDeps, userId: string, journalId: string, input: { newOwnerId: string; reason: string }): Promise<JournalRow> {
  return serializable(deps, async (tx) => {
    await lockJournal(tx, journalId);
    const { journal, membership } = await requireJournalMember(tx, journalId, userId, ['owner'], true);
    if (journal.operationalState === 'closed') throw new JournalError('INVALID_STATE', '已关闭期刊不能转移负责人');
    if (input.newOwnerId === userId) throw new JournalError('VALIDATION_ERROR', '新负责人不能是当前负责人');
    const target = await tx.membership.findUnique({ where: { workspaceId_userId: { workspaceId: journal.workspaceId, userId: input.newOwnerId } } });
    if (!target) throw new JournalError('VALIDATION_ERROR', '新负责人必须已是期刊成员');
    const targetUser = await tx.user.findUnique({ where: { id: input.newOwnerId } });
    if (!targetUser || !['email_verified', 'identity_verified'].includes(targetUser.status)) throw new JournalError('VALIDATION_ERROR', '新负责人账号状态不可用');
    const reason = required(input.reason, '转移原因', 2_000);
    await tx.membership.update({ where: { id: membership.id }, data: { role: 'maintainer' } });
    await tx.membership.update({ where: { id: target.id }, data: { role: 'owner' } });
    await tx.workspace.update({ where: { id: journal.workspaceId }, data: { ownerId: input.newOwnerId } });
    const updated = await tx.journal.update({ where: { id: journalId }, data: { operationalState: 'reverification', revision: { increment: 1 } } });
    await recordJournalEvent(tx, { journalId, actorId: userId, action: 'journal.owner.transfer', targetType: 'user', targetId: input.newOwnerId, reason, before: { ownerId: userId, operationalState: journal.operationalState }, after: { ownerId: input.newOwnerId, operationalState: 'reverification' } });
    return updated;
  });
}

export async function setJournalOperationalState(deps: WorkspaceDeps, adminId: string, input: { journalId: string; action: 'pause' | 'close' | 'reverify' | 'resume'; reason: string }): Promise<JournalRow> {
  return serializable(deps, async (tx) => {
    await requirePlatformAdmin(tx, adminId); await lockJournal(tx, input.journalId);
    const journal = await tx.journal.findUnique({ where: { id: input.journalId } }); if (!journal) throw new JournalError('JOURNAL_NOT_FOUND', '期刊不存在');
    const next: JournalOperationalState = input.action === 'pause' ? 'paused' : input.action === 'close' ? 'closed' : input.action === 'reverify' ? 'reverification' : 'active';
    if (input.action === 'resume' && !['paused', 'reverification'].includes(journal.operationalState)) throw new JournalError('INVALID_STATE', '当前状态不能直接恢复');
    const reason = required(input.reason, '操作原因', 2_000);
    const updated = await tx.journal.update({ where: { id: input.journalId }, data: { operationalState: next, revision: { increment: 1 } } });
    await recordJournalEvent(tx, { journalId: journal.id, actorId: adminId, action: `journal.${input.action}`, targetType: 'journal', targetId: journal.id, reason, before: { operationalState: journal.operationalState }, after: { operationalState: next } });
    return updated;
  });
}

export async function createJournalServiceRequest(deps: WorkspaceDeps, userId: string, journalId: string, input: { annualVolume: number; language: string; figureScale: string; services: string[]; notes?: string; requestKey: string }): Promise<ServiceRow> {
  if (!Number.isInteger(input.annualVolume) || input.annualVolume <= 0) throw new JournalError('VALIDATION_ERROR', '预计年发文量必须是正整数');
  const normalized = {
    annualVolume: input.annualVolume,
    language: required(input.language, '语言', 100),
    figureScale: required(input.figureScale, '图表规模', 100),
    services: serviceSelections(input.services),
    notes: optional(input.notes),
    requestKey: required(input.requestKey, '请求键', 200),
  };
  return serializable(deps, async (tx) => {
    await lockJournal(tx, journalId); await requireJournalMember(tx, journalId, userId, ['owner', 'maintainer']);
    const existing = await tx.journalServiceRequest.findUnique({ where: { requestKey: normalized.requestKey } });
    if (existing) {
      if (existing.journalId !== journalId || existing.requesterId !== userId || existing.annualVolume !== normalized.annualVolume || existing.language !== normalized.language || existing.figureScale !== normalized.figureScale || existing.notes !== (normalized.notes ?? null) || JSON.stringify(existing.services) !== JSON.stringify(normalized.services)) throw new JournalError('IDEMPOTENCY_CONFLICT', '请求键已用于不同服务申请');
      return existing;
    }
    const created = await tx.journalServiceRequest.create({ data: { journalId, requesterId: userId, ...normalized } });
    await recordJournalEvent(tx, { journalId, actorId: userId, action: 'journal.service_request.create', targetType: 'journal_service_request', targetId: created.id });
    return created;
  }, true);
}

export async function reviewJournalServiceRequest(deps: WorkspaceDeps, adminId: string, requestId: string, input: { status: 'quoted' | 'rejected' | 'cancelled'; expectedStatus: string; note: string }): Promise<ServiceRow> {
  return serializable(deps, async (tx) => {
    await requirePlatformAdmin(tx, adminId);
    const request = await tx.journalServiceRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new JournalError('JOURNAL_NOT_FOUND', '服务申请不存在');
    await lockJournal(tx, request.journalId);
    const note = required(input.note, '处理说明', 5000);
    if (request.status === input.status && request.reviewNotes === note) return request;
    if (request.status !== input.expectedStatus || !['submitted', 'quoted'].includes(request.status)) throw new JournalError('INVALID_STATE', '服务申请状态已改变，请刷新后重试');
    const updated = await tx.journalServiceRequest.update({ where: { id: requestId }, data: { status: input.status, reviewNotes: note, reviewedBy: adminId, reviewedAt: currentTime(deps) } });
    await recordJournalEvent(tx, { journalId: request.journalId, actorId: adminId, action: 'journal.service_request.review', targetType: 'journal_service_request', targetId: requestId, reason: note, before: { status: request.status }, after: { status: input.status } });
    await tx.notification.create({ data: { userId: request.requesterId, type: 'journal.service_request', payload: { journalId: request.journalId, requestId, status: input.status, note } } });
    return updated;
  });
}

export async function grantJournalCredits(deps: WorkspaceDeps, adminId: string, input: { journalId: string; amount: number; expiresAt: Date; reason: string; requestKey: string; serviceRequestId?: string }): Promise<{ amount: number }> {
  if (!Number.isInteger(input.amount) || input.amount === 0) throw new JournalError('VALIDATION_ERROR', '额度调整必须是非零整数');
  return serializable(deps, async (tx) => {
    await requirePlatformAdmin(tx, adminId); await lockJournal(tx, input.journalId);
    if (!await tx.journal.findUnique({ where: { id: input.journalId } })) throw new JournalError('JOURNAL_NOT_FOUND', '期刊不存在');
    const grantKey = `admin:${required(input.requestKey, '请求键', 200)}`;
    const reason = required(input.reason, '额度调整原因', 2_000); const now = currentTime(deps);
    const serviceRequest = input.serviceRequestId ? await tx.journalServiceRequest.findUnique({ where: { id: input.serviceRequestId } }) : null;
    if (input.serviceRequestId && (!serviceRequest || serviceRequest.journalId !== input.journalId || input.amount < 0)) throw new JournalError('VALIDATION_ERROR', '服务申请不属于该期刊或服务额度不是正数');
    const existing = await tx.journalGrant.findUnique({ where: { grantKey } });
    if (existing) {
      if (existing.journalId !== input.journalId || existing.amount !== input.amount || existing.expiresAt.getTime() !== input.expiresAt.getTime() || existing.reason !== reason || existing.serviceRequestId !== (input.serviceRequestId ?? null)) throw new JournalError('IDEMPOTENCY_CONFLICT', '请求键已用于不同额度调整');
      return { amount: existing.amount };
    }
    let adjustment: JournalGrant;
    if (serviceRequest && !['submitted', 'quoted'].includes(serviceRequest.status)) throw new JournalError('INVALID_STATE', '此服务申请已处理，请勿重复开通');
    if (input.amount > 0) {
      if (!(input.expiresAt > now)) throw new JournalError('VALIDATION_ERROR', '额度到期时间必须晚于当前时间');
      adjustment = await tx.journalGrant.create({ data: { journalId: input.journalId, amount: input.amount, remaining: input.amount, expiresAt: input.expiresAt, grantKey, reason, serviceRequestId: input.serviceRequestId ?? null } });
    } else {
      const grants = await tx.journalGrant.findMany({ where: { journalId: input.journalId, expiresAt: { gt: now } }, orderBy: { expiresAt: 'desc' } });
      const available = grants.reduce((sum, grant) => sum + grant.remaining - grant.reserved, 0);
      if (available < -input.amount) throw new JournalError('INSUFFICIENT_CREDITS', '调减额度超过当前可用额度');
      let deduction = -input.amount;
      for (const grant of grants) {
        const take = Math.min(deduction, grant.remaining - grant.reserved); if (take <= 0) continue;
        await tx.journalGrant.update({ where: { id: grant.id }, data: { amount: { decrement: take }, remaining: { decrement: take } } }); deduction -= take;
        if (deduction === 0) break;
      }
      adjustment = await tx.journalGrant.create({ data: { journalId: input.journalId, amount: input.amount, remaining: 0, expiresAt: input.expiresAt, grantKey, reason, serviceRequestId: input.serviceRequestId ?? null } });
    }
    await tx.journalLedger.create({ data: { journalId: input.journalId, grantId: adjustment.id, kind: input.amount > 0 ? 'grant' : 'adjustment', amount: input.amount, eventKey: grantKey } });
    if (serviceRequest) await tx.journalServiceRequest.update({ where: { id: serviceRequest.id }, data: { status: 'approved', reviewedBy: adminId, reviewedAt: now } });
    await recordJournalEvent(tx, { journalId: input.journalId, actorId: adminId, action: 'journal.credit.adjust', targetType: input.serviceRequestId ? 'journal_service_request' : 'journal', targetId: input.serviceRequestId ?? input.journalId, reason, after: { amount: input.amount, requestKey: input.requestKey } });
    return { amount: input.amount };
  }, true);
}

export async function getPublicJournal(deps: WorkspaceDeps, slugOrId: string): Promise<JournalPublicDetail> {
  const db = deps.prisma;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
  const journal = await db.journal.findFirst({ where: { OR: [{ slug: slugOrId }, ...(isUuid ? [{ id: slugOrId }] : [])], homepagePublished: true } });
  if (!journal) throw new JournalError('JOURNAL_NOT_FOUND', '期刊不存在');
  const identifiers = await db.journalIdentifier.findMany({ where: { journalId: journal.id } });
  return { id: journal.id, slug: journal.slug, nameZh: journal.nameZh, nameEn: journal.nameEn, pIssn: identifiers.find((item) => item.type === 'print')?.value ?? null, eIssn: identifiers.find((item) => item.type === 'electronic')?.value ?? null, websiteUrl: journal.websiteUrl, publisherName: journal.publisherName, sponsorName: journal.sponsorName, subjects: journal.subjects, description: journal.description, logoUrl: journal.logoUrl, operationalState: journal.operationalState, verifiedAt: journal.verifiedAt };
}
