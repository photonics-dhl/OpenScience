import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HermesSourceIdentityReview } from '@/components/hermes/HermesSourceIdentityReview';
import type { SourceIdentityProposal } from '@/lib/api';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string, values?: Record<string, number>) => `${key}${values?.page ? ` ${values.page}` : ''}` }));

describe('Hermes source identity review', () => {
  it('shows complete source quotes, page and PDF while leaving acceptance explicit', () => {
    const proposal: SourceIdentityProposal = { schemaVersion: '0.1.0',
      title: { state: 'proposed', value: 'Grounded title', evidenceSegments: [{ quote: 'Complete quoted title', sourceLocator: {
        artifactId: 'artifact/a', contentHash: 'a'.repeat(64), page: 2, blockId: 'b1', charRange: { start: 0, end: 21 },
        boundingBox: { x: 0, y: 0, width: 100, height: 20 },
      } }] },
      authors: { state: 'needs_review', value: ['A. Author'], evidenceSegments: [] },
      doi: { state: 'not_extracted', value: '', evidenceSegments: [] },
      articleLicense: { state: 'not_extracted', value: '', evidenceSegments: [] },
    };
    const html = renderToStaticMarkup(<HermesSourceIdentityReview proposal={proposal} acceptedFields={[]} disabled={false} onToggle={() => {}} />);
    expect(html).toContain('Complete quoted title');
    expect(html).toContain('sourceIdentityPage 2');
    expect(html).toContain('/api/artifacts/artifact%2Fa/download');
    expect(html.match(/type="checkbox"/g)).toHaveLength(1);
    expect(html).not.toContain('checked=""');
    expect(html).toContain('sourceIdentityDescription');
  });
});
