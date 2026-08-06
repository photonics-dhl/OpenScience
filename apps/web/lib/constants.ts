/** P1D-9：§6.2 法律免责声明默认文案 */
export const LEGAL_DISCLAIMER_DEFAULT =
  '此时间戳仅证明平台在相应时间接收并记录了该版本及其内容哈希，不构成专利优先权、著作权归属、科研正确性或司法存证保证。';

/** P1D-9：许可证类型显示名称 */
export const LICENSE_NAMES: Record<string, string> = {
  // 文字许可
  'CC-BY-4.0': 'CC BY 4.0',
  'CC-BY-NC-4.0': 'CC BY-NC 4.0',
  'All-Rights-Reserved': 'All Rights Reserved',
  // 代码许可
  'MIT': 'MIT License',
  'Apache-2.0': 'Apache License 2.0',
  'GPL-3.0': 'GPL 3.0',
  'Proprietary': '不开源',
  // 数据许可
  'CC0': 'CC0 (Public Domain)',
  'Custom-Restricted': '自定义限制',
  'No-Download': '不可下载',
};
