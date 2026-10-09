import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../app/contact/email/route';

const origin = 'https://openscience.example';
const headers = { 'Content-Type': 'application/json', 'X-OpenScience-Contact-Intent': 'compose', Origin: origin };
const composeRequest = (body: unknown = { intent: 'compose' }, overrides = {}) => new Request(`${origin}/contact/email`, {
  method: 'POST', headers: { ...headers, ...overrides }, body: JSON.stringify(body),
});

afterEach(() => vi.unstubAllEnvs());

describe('contact recipient disclosure', () => {
  it('returns only the configured recipient on an explicit compose request without caching', async () => {
    vi.stubEnv('OPENSCIENCE_CONTACT_EMAIL', 'contact@example.org');
    vi.stubEnv('NEXT_PUBLIC_OPENSCIENCE_CONTACT_EMAIL', 'legacy@example.org');
    const response = await POST(composeRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ email: 'contact@example.org' });
  });

  it('retains the legacy configuration and rejects malformed recipient settings', async () => {
    vi.stubEnv('OPENSCIENCE_CONTACT_EMAIL', 'bad address');
    vi.stubEnv('NEXT_PUBLIC_OPENSCIENCE_CONTACT_EMAIL', 'legacy@example.org');
    expect(await (await POST(composeRequest())).json()).toEqual({ email: 'legacy@example.org' });
    vi.stubEnv('NEXT_PUBLIC_OPENSCIENCE_CONTACT_EMAIL', 'bad@example.org?cc=someone@example.org');
    expect(await (await POST(composeRequest())).json()).toEqual({ email: 'chunanqing@opt.ac.cn' });
  });

  it('does not disclose a recipient to missing-intent or cross-origin requests', async () => {
    for (const overrides of [{ 'X-OpenScience-Contact-Intent': '' }, { Origin: 'https://other.example' }, { Origin: 'not a URL' }]) {
      const response = await POST(composeRequest(undefined, overrides));
      expect(response.status).toBe(403);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(await response.json()).toEqual({ error: 'forbidden' });
    }
  });

  it('accepts the browser-facing host when Next uses an internal URL or local hostname alias', async () => {
    vi.stubEnv('OPENSCIENCE_CONTACT_EMAIL', 'contact@example.org');
    const response = await POST(new Request('http://localhost:3010/contact/email', {
      method: 'POST', headers: { ...headers, Host: 'openscience.example' }, body: JSON.stringify({ intent: 'compose' }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ email: 'contact@example.org' });
  });

  it('rejects invalid requests and extra fields instead of accepting private consultation content', async () => {
    for (const body of [null, [], { intent: 'preview' }, { intent: 'compose', body: 'Private consultation' }]) {
      const response = await POST(composeRequest(body));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid_request' });
    }
    expect((await POST(composeRequest(undefined, { 'Content-Type': 'text/plain' }))).status).toBe(400);
    expect((await POST(new Request(`${origin}/contact/email`, { method: 'POST', headers, body: '{' }))).status).toBe(400);
  });
});
