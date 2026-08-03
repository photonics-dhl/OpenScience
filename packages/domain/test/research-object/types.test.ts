import { describe, expect, it } from 'vitest';
import { SDF_CORE_FIELDS } from '@openscience/sdf-schema';
import { RO_STATUSES, RO_VISIBILITIES, SDF_NODE_TYPES } from '../../src/research-object/types';

describe('RO/SDF 常量（§4.1/§4.2/§5.1）', () => {
  it('RO 状态机 9 枚举完整（§4.1 建议 + 补充）', () => {
    expect(RO_STATUSES).toEqual([
      'draft', 'under_review', 'approved', 'published', 'revised',
      'withdrawn', 'restricted', 'rejected', 'archived',
    ]);
  });

  it('可见性三态（§4.2）', () => {
    expect(RO_VISIBILITIES).toEqual(['private', 'invite_only', 'public']);
  });

  it('SDFNode 六型对齐 P1B-1 SDF_CORE_FIELDS（§5.1）', () => {
    expect(SDF_NODE_TYPES).toEqual([...SDF_CORE_FIELDS]);
    expect(SDF_NODE_TYPES).toHaveLength(6);
  });
});
