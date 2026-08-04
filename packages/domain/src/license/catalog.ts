import { LicenseError } from './errors';

/** 三类许可类型（§6.3：文字/代码/数据分别选择）。 */
export const LICENSE_TYPES = ['text', 'code', 'data'] as const;
export type LicenseType = (typeof LICENSE_TYPES)[number];

export interface LicenseOption {
  id: string;
  name: string;
}

/**
 * 许可目录（§6.3 + §24 待确认）：仅标准标识 + 人读名称。
 * 完整法律文案属 §24 待确认项——禁止在此写死法律措辞，见 packages/config LICENSE_LEGAL_TEXT_PLACEHOLDER。
 */
export const LICENSE_CATALOG: Record<LicenseType, LicenseOption[]> = {
  text: [
    { id: 'CC-BY-4.0', name: 'Creative Commons Attribution 4.0' },
    { id: 'CC-BY-NC-4.0', name: 'Creative Commons Attribution-NonCommercial 4.0' },
    { id: 'ALL-RIGHTS-RESERVED', name: 'All Rights Reserved' },
  ],
  code: [
    { id: 'MIT', name: 'MIT License' },
    { id: 'Apache-2.0', name: 'Apache License 2.0' },
    { id: 'GPL-3.0', name: 'GNU General Public License v3.0' },
    { id: 'PROPRIETARY', name: 'Proprietary (Not Open Source)' },
  ],
  data: [
    { id: 'CC0-1.0', name: 'Creative Commons Zero v1.0' },
    { id: 'CC-BY-4.0', name: 'Creative Commons Attribution 4.0' },
    { id: 'CUSTOM', name: 'Custom Restrictions' },
    { id: 'NO-DOWNLOAD', name: 'No Download' },
  ],
};

const VALID = new Map<string, boolean>();
for (const opts of Object.values(LICENSE_CATALOG)) for (const o of opts) VALID.set(o.id, true);

/** 校验许可证标识合法（§6.3 目录内）。 */
export function assertValidLicenseId(id: string): void {
  if (!VALID.has(id)) {
    throw new LicenseError('INVALID_LICENSE_ID', `非法许可证标识: ${id}`);
  }
}
