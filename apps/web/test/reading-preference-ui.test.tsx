import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

afterEach(() => vi.unstubAllGlobals());

describe('evidence reading preference', () => {
  it('uses the authenticated same-origin API with optimistic concurrency', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ evidenceDefaultCollapsed: false, version: 3 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'csrf-reading-preference' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ evidenceDefaultCollapsed: true, version: 4 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { getReadingPreference, updateReadingPreference } = await import('../lib/api');
    await expect(getReadingPreference()).resolves.toEqual({ evidenceDefaultCollapsed: false, version: 3 });
    await expect(updateReadingPreference({ evidenceDefaultCollapsed: true, expectedVersion: 3 })).resolves.toEqual({ evidenceDefaultCollapsed: true, version: 4 });
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/reading-preferences', expect.objectContaining({ credentials: 'include' }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/csrf-token', expect.objectContaining({ credentials: 'include' }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/reading-preferences', expect.objectContaining({
      credentials: 'include',
      method: 'PATCH',
      headers: expect.objectContaining({ 'x-csrf-token': 'csrf-reading-preference' }),
    }));
  });

  it('persists a safe anonymous fallback without accessing global storage during SSR', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const preference = await import('../lib/evidence-reading-preference');
    expect(preference.readLocalEvidenceDefaultCollapsed(storage)).toBe(false);
    preference.writeLocalEvidenceDefaultCollapsed(true, storage);
    expect(preference.readLocalEvidenceDefaultCollapsed(storage)).toBe(true);
  });

  it('renders an explicit accessible setting rather than a public-page mode switch', async () => {
    const { EvidenceReadingPreferenceControl } = await import('../components/settings/EvidenceReadingPreferenceControl');
    const markup = renderToStaticMarkup(<EvidenceReadingPreferenceControl busy={false} checked onChange={() => undefined} status="saved" />);
    expect(markup).toContain('data-evidence-reading-preference="true"');
    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain('checked=""');
    expect(markup).toContain('aria-live="polite"');
  });
});
