import { describe, expect, it } from 'vitest';
import {
  EDITORIAL_DISCLOSURE,
  assertEditorialRole,
  assertEditorialTransition,
  buildEditorialSnapshot,
  validateEditorialMedia,
} from '../../src/editorial/editorial';

describe('Editorial Curator contracts', () => {
  it('limits curation writes to platform administrators', () => {
    expect(() => assertEditorialRole('user')).toThrowError(/platform administrator/i);
    expect(() => assertEditorialRole('moderator')).toThrowError(/platform administrator/i);
    expect(() => assertEditorialRole('platform_admin')).not.toThrow();
  });

  it('enforces draft → internal review → scheduled → published', () => {
    expect(() => assertEditorialTransition('draft', 'scheduled')).toThrowError(/transition/i);
    expect(() => assertEditorialTransition('draft', 'internal_review')).not.toThrow();
    expect(() => assertEditorialTransition('internal_review', 'scheduled')).not.toThrow();
    expect(() => assertEditorialTransition('scheduled', 'published')).not.toThrow();
    expect(() => assertEditorialTransition('published', 'draft')).toThrowError(/transition/i);
  });

  it('requires explicit provenance for image and video media', () => {
    expect(() => validateEditorialMedia([{ type: 'image', url: 'https://cdn.example/figure.webp', alt: 'Transient absorption map' } as never])).toThrowError(/provenance/i);
    expect(validateEditorialMedia([{
      type: 'video',
      url: 'https://cdn.example/method.mp4',
      alt: 'Pump-probe acquisition sequence',
      credit: 'OpenScience demonstration catalog',
      licenseId: 'CC-BY-4.0',
      sourceUrl: 'https://example.org/source',
    }])).toHaveLength(1);
  });

  it('snapshots the selected published version and carries a non-review disclosure', () => {
    expect(buildEditorialSnapshot({
      researchObjectId: 'ro-1',
      versionId: 'v-2',
      title: 'Ultrafast carrier relaxation',
      publicId: 'OSR-2026-000001',
      versionNo: 2,
      sdf: { insight: 'A stable observation.' },
    })).toEqual({
      researchObjectId: 'ro-1',
      versionId: 'v-2',
      title: 'Ultrafast carrier relaxation',
      publicId: 'OSR-2026-000001',
      versionNo: 2,
      sdf: { insight: 'A stable observation.' },
      disclosure: EDITORIAL_DISCLOSURE,
    });
    expect(EDITORIAL_DISCLOSURE).toMatch(/not peer-review acceptance/i);
  });
});
