import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const repoRoot = resolve(process.cwd(), '..', '..');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('same-origin API routing contract', () => {
  it('strips the browser-only /api prefix before Fastify in production', () => {
    const nginx = readFileSync(resolve(repoRoot, 'infra/nginx/openscience.conf'), 'utf8');
    expect(nginx).toMatch(/location \/api\/\s*\{[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:3001\/;/);
  });

  it('reconciles the active nginx config on every production deployment', () => {
    const deploy = readFileSync(resolve(repoRoot, 'infra/scripts/deploy.sh'), 'utf8');
    expect(deploy).toContain('install -m 0644 $REMOTE_ROOT/infra/nginx/openscience.conf $NGINX_CONF');
    expect(deploy).not.toContain('test -f $NGINX_CONF || cp');
  });

  it('rewrites /api routes to Fastify during local Next development', () => {
    const config = readFileSync(resolve(process.cwd(), 'next.config.mjs'), 'utf8');
    expect(config).toContain("source: '/api/:path*'");
    expect(config).toContain("destination: `${apiOrigin}/:path*`");
  });
});

describe('apiRequest CSRF contract', () => {
  it('does not request a CSRF token for reads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { apiRequest } = await import('../lib/api');

    await expect(apiRequest<{ ok: boolean }>('/api/auth/me')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({ credentials: 'include' }));
  });

  it('attaches the existing double-submit token to protected writes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrfToken: 'signed-csrf-token' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ researchObject: { id: 'ro-1' } }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { apiRequest } = await import('../lib/api');

    await apiRequest('/api/research-objects', {
      method: 'POST',
      body: JSON.stringify({ title: 'Evidence map' }),
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/csrf-token',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/research-objects',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ 'x-csrf-token': 'signed-csrf-token' }),
      }),
    );
  });

  it('keeps public auth writes exempt from CSRF acquisition', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ userId: 'user-1', status: 'active' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { apiRequest } = await import('../lib/api');

    await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'researcher@example.org', password: 'redacted1' }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.not.objectContaining({ headers: expect.objectContaining({ 'x-csrf-token': expect.any(String) }) }),
    );
  });

  it('protects session-changing auth writes such as logout', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'signed-csrf-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const { apiRequest } = await import('../lib/api');

    await apiRequest('/api/auth/logout', { method: 'POST' });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/auth/logout',
      expect.objectContaining({ headers: expect.objectContaining({ 'x-csrf-token': 'signed-csrf-token' }) }),
    );
  });

  it('routes sandbox writes through the same CSRF transport', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'signed-csrf-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ job: { id: 'job-1', status: 'pending', createdAt: 'now' } }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const { createSandboxJob } = await import('../lib/api');

    await createSandboxJob({ workspaceId: 'workspace-1', script: 'print(1)' });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/sandbox-jobs',
      expect.objectContaining({ headers: expect.objectContaining({ 'x-csrf-token': 'signed-csrf-token' }) }),
    );
  });

  it('routes script modification through the same CSRF transport', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'signed-csrf-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ newScript: 'print(2)', diff: '+2', policyResult: { allowed: true, violations: [] } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { modifyScript } = await import('../lib/api');

    await modifyScript('job-1', { prompt: 'Change the value' });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/sandbox-jobs/job-1/modify',
      expect.objectContaining({ headers: expect.objectContaining({ 'x-csrf-token': 'signed-csrf-token' }) }),
    );
  });

  it('prepares multipart XHR uploads with credentials and CSRF without forcing JSON content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ csrfToken: 'signed-csrf-token' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const xhr = {
      open: vi.fn(),
      setRequestHeader: vi.fn(),
      withCredentials: false,
    };
    const { prepareProtectedXhr } = await import('../lib/api');

    await prepareProtectedXhr(xhr, 'POST', '/api/artifacts/upload');

    expect(xhr.open).toHaveBeenCalledWith('POST', '/api/artifacts/upload');
    expect(xhr.withCredentials).toBe(true);
    expect(xhr.setRequestHeader).toHaveBeenCalledWith('x-csrf-token', 'signed-csrf-token');
    expect(xhr.setRequestHeader).not.toHaveBeenCalledWith('content-type', expect.any(String));
  });

  it('polls and retries ingestion through the protected API contract', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ batchId: 'batch-1', researchObjectId: 'ro-1', tasks: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'signed-csrf-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ task: { id: 'task-1', state: 'queued' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { getIngestionBatch, retryIngestionTask } = await import('../lib/api');

    await expect(getIngestionBatch('batch-1')).resolves.toMatchObject({ batchId: 'batch-1' });
    await expect(retryIngestionTask('task-1')).resolves.toMatchObject({ id: 'task-1', state: 'queued' });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/ingestion/task-1/retry', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'x-csrf-token': 'signed-csrf-token' }),
    }));
  });
});
