import { SDF_CORE_FIELDS } from '@openscience/sdf-schema';

/** RO 状态机（§4.1 建议 + 补充状态）。MVP 只落地 draft 及后续阶段所需，流转逻辑留 1C/1D。 */
export const RO_STATUSES = [
  'draft',
  'under_review',
  'approved',
  'published',
  'revised',
  'withdrawn',
  'restricted',
  'rejected',
  'archived',
] as const;
export type RoStatus = (typeof RO_STATUSES)[number];

/** RO 可见性（§4.2 三态）。 */
export const RO_VISIBILITIES = ['private', 'invite_only', 'public'] as const;
export type RoVisibility = (typeof RO_VISIBILITIES)[number];

/** SDFNode 类型（§5.1 六字段，对齐 P1B-1 SDF_CORE_FIELDS）。 */
export const SDF_NODE_TYPES = [...SDF_CORE_FIELDS] as const;
export type SdfNodeType = (typeof SDF_NODE_TYPES)[number];
