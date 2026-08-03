/**
 * 公开 RO ID（§6.1）：OSR-YYYY-NNNNNN。
 * 前缀 OSR 是配置项（PUBLIC_ID_PREFIX env，§24 待确认，禁写死）——函数接收 prefix 参数。
 * 公开 ID 永不复用（§6.1 MUST）；版本 ID = OSR-YYYY-NNNNNN-vN；URL = /research/<publicId>/v/<versionNo>。
 */

const ID_RE = /^([A-Z0-9]{2,8})-(\d{4})-(\d{6})$/;

/** 生成公开 RO ID：prefix-YYYY-NNNNNN（seq 6 位补零）。 */
export function generatePublicId(prefix: string, year: number, seq: number): string {
  const seqStr = String(seq).padStart(6, '0');
  return `${prefix}-${year}-${seqStr}`;
}

/** 解析 OSR-YYYY-NNNNNN → { prefix, year, seq }；非法返回 null。 */
export function parsePublicId(id: string): { prefix: string; year: number; seq: number } | null {
  const m = ID_RE.exec(id.trim());
  if (!m) return null;
  return { prefix: m[1], year: Number(m[2]), seq: Number(m[3]) };
}

/** 版本 ID：OSR-YYYY-NNNNNN-vN（§6.1）。 */
export function versionPublicId(roPublicId: string, versionNo: number): string {
  return `${roPublicId}-v${versionNo}`;
}

/** 稳定 URL：/research/<publicId>/v/<versionNo>（§6.1）。 */
export function researchUrl(roPublicId: string, versionNo: number): string {
  return `/research/${roPublicId}/v/${versionNo}`;
}

/** 解析版本 ID OSR-YYYY-NNNNNN-vN → { roPublicId, versionNo }。 */
export function parseVersionId(versionId: string): { roPublicId: string; versionNo: number } | null {
  const m = /^(.+-v)(\d+)$/.exec(versionId.trim());
  if (!m) return null;
  const roPublicId = m[1].slice(0, -2); // 去掉 "-v"
  const versionNo = Number(m[2]);
  return { roPublicId, versionNo };
}
