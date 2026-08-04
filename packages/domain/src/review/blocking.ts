/** P1D-5：§11.1 七类硬阻断——纯函数判定（可单测，无 DB）。 */

import { SDF_CORE_FIELDS } from '@openscience/sdf-schema';

export interface HardBlock {
  code: string;
  reason: string;
}

/** 危险可执行扩展名（§11.1 恶意代码 + §17 上传扫描，P1B-8 实装病毒扫描联动）。 */
export const DANGEROUS_EXTENSIONS = [
  '.exe', '.dll', '.so', '.dylib', '.bat', '.cmd', '.sh', '.ps1', '.msi', '.scr', '.vbs', '.jar',
];
/** 危险 MIME（可执行/脚本类）。 */
export const DANGEROUS_MIME = [
  'application/x-executable', 'application/x-msdownload', 'application/x-msdos-program',
  'application/x-sh', 'application/x-powershell',
];

/** §17 高风险隐私正则：身份证（中国 18 位）/ AWS key / 通用 token（§11.1 隐私泄露）。 */
export const SENSITIVE_PATTERNS: Array<{ code: string; re: RegExp }> = [
  { code: 'cn_id_card', re: /\b[1-9]\d{5}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/ },
  { code: 'aws_access_key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { code: 'private_key', re: /-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----/ },
  { code: 'github_token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
];

/** 违法/平台禁止关键词（§11.1 明显违法；登记：P1D-9 AI 语义层增强，本期望确定性匹配）。 */
export const PROHIBITED_KEYWORDS = ['攻击方法', '制作毒品', '儿童色情', '枪支购买', '银行卡盗刷'];

/** 阻断 1：必填字段缺失（§5.1 六字段非空）。 */
export function checkCoreCompleteness(core: Record<string, unknown>): HardBlock | null {
  const missing = SDF_CORE_FIELDS.filter((f) => {
    const v = core[f];
    return typeof v !== 'string' || v.trim().length === 0;
  });
  if (missing.length > 0) {
    return { code: 'missing_fields', reason: `必填字段缺失: ${missing.join(', ')}（§5.1）` };
  }
  return null;
}

/** 阻断 2：恶意代码/危险可执行内容（§11.1 + §17）。 */
export function checkMaliciousArtifact(logicalPath: string, mimeType: string | null): HardBlock | null {
  const lower = logicalPath.toLowerCase();
  if (DANGEROUS_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return { code: 'dangerous_extension', reason: `危险可执行扩展名: ${logicalPath}` };
  }
  if (mimeType && DANGEROUS_MIME.includes(mimeType)) {
    return { code: 'dangerous_mime', reason: `危险 MIME 类型: ${mimeType}` };
  }
  return null;
}

/** 阻断 3：高风险隐私泄露（§17 + §11.1）。 */
export function checkSensitiveContent(text: string): HardBlock | null {
  for (const { code, re } of SENSITIVE_PATTERNS) {
    if (re.test(text)) {
      return { code: 'sensitive_leak', reason: `检测到高风险隐私信息（${code}），公开前必须移除（§17）` };
    }
  }
  return null;
}

/** 阻断 4：明显违法或平台禁止内容（§11.1）。 */
export function checkProhibitedContent(text: string): HardBlock | null {
  const hit = PROHIBITED_KEYWORDS.find((k) => text.includes(k));
  if (hit) {
    return { code: 'prohibited_content', reason: `含平台禁止内容关键词: ${hit}` };
  }
  return null;
}
