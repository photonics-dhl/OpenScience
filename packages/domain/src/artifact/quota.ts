import type { PrismaClient } from '@prisma/client';
import { resolvePolicy } from '../usage/policies';
import { ArtifactError } from './errors';

/** §13.3 单文件大小配额资源名（QUOTA_RESOURCES 之一）。 */
export const UPLOAD_MAX_FILE_RESOURCE = 'file_size_bytes';

/**
 * 上传前配额检查（§13.3 MUST：单文件大小限制后台可配置，不写死前端）。
 * - 读 QuotaPolicy（workspace → user_level → global 三层回退）
 * - 超限 → FILE_TOO_LARGE（413）
 * - 无配额配置 → 放行（null = 无限制）
 * - P1B-3 只读不扣费（UsageLedger 记账归 P1B-6）
 */
export async function checkUploadQuota(
  deps: { prisma: PrismaClient },
  input: { workspaceId: string; userLevel?: string; fileSize: number },
): Promise<void> {
  const policy = await resolvePolicy(deps, {
    workspaceId: input.workspaceId,
    userLevel: input.userLevel,
    resource: UPLOAD_MAX_FILE_RESOURCE,
  });
  if (!policy) return;
  if (input.fileSize > policy.limitValue) {
    throw new ArtifactError(
      'FILE_TOO_LARGE',
      `文件大小 ${input.fileSize} 超过配额 ${policy.limitValue} 字节`,
    );
  }
}
