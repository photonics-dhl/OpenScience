import type { JournalArticleSourceRecord, JournalRightsStatus } from './journal-api';
export type SourcePermissions = JournalArticleSourceRecord['permissions'];
export const PERMISSION_KEYS: Array<keyof SourcePermissions> = ['internalProcessing', 'derivativeGeneration', 'externalProcessing', 'publicSource', 'publicDerivative', 'figureReuse', 'derivativeIllustration'];
export const HERMES_PERMISSIONS: Array<keyof SourcePermissions> = ['internalProcessing', 'derivativeGeneration', 'externalProcessing'];
export const STATUS_PERMISSIONS: Record<JournalRightsStatus, Array<keyof SourcePermissions>> = {
  unknown: [], metadata_only_allowed: [], abstract_processing_allowed: HERMES_PERMISSIONS,
  internal_processing_only: HERMES_PERMISSIONS,
  public_summary_allowed: [...HERMES_PERMISSIONS, 'publicDerivative'], figure_reuse_allowed: ['publicSource', 'figureReuse'],
  derivative_illustration_allowed: [...HERMES_PERMISSIONS, 'derivativeIllustration'], full_public_processing_allowed: PERMISSION_KEYS, restricted_blocked: [],
};
export const HERMES_DISCLOSURE = 'Hermes 处理可能将论文文本发送至配置的外部模型服务；这不等于向公众公开。';
export const RIGHTS_EXAMPLE = '例如：已获得出版商书面授权，允许将论文文本交由配置的 AI 服务进行解读，并公开解读文字；不包含原文图片的公开使用。授权邮件见“授权证明.pdf”。';
export function emptySourcePermissions(): SourcePermissions { return { internalProcessing: false, derivativeGeneration: false, externalProcessing: false, publicSource: false, publicDerivative: false, figureReuse: false, derivativeIllustration: false }; }
/** Changing a status never grants permission. */
export function limitPermissions(status: JournalRightsStatus, current: SourcePermissions): SourcePermissions {
  const result = emptySourcePermissions();
  for (const key of PERMISSION_KEYS) result[key] = STATUS_PERMISSIONS[status].includes(key) && current[key] === true;
  return result;
}
export function setHermesConsent(status: JournalRightsStatus, current: SourcePermissions, accepted: boolean): SourcePermissions {
  const result = { ...current };
  for (const key of HERMES_PERMISSIONS) result[key] = accepted && STATUS_PERMISSIONS[status].includes(key);
  return result;
}
/** Preserve historical expiry; do not silently remove existing time limits. */
export function editSourceEvidence(previous: JournalArticleSourceRecord['evidence'], statement: string, license: string): JournalArticleSourceRecord['evidence'] {
  if (!statement.trim()) throw new Error('请说明授权来源或核验依据，示例不能作为实际授权。');
  return { statement: statement.trim(), ...(license.trim() ? { license: license.trim() } : {}),
    ...(previous.verifiedBy ? { verifiedBy: previous.verifiedBy } : {}), ...(previous.verifiedAt ? { verifiedAt: previous.verifiedAt } : {}), ...(previous.expiresAt ? { expiresAt: previous.expiresAt } : {}),
  };
}
