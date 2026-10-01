import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const user = (userId = 'alice') => ({ userId, email: `${userId}@example.test`, displayName: userId, status: 'active', level: 'free' });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.stubGlobal('window', new EventTarget());
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); });

describe('browser session request reuse', () => {
  it('coalesces concurrent fresh identity checks, then still revalidates a later action', async () => {
    const gate = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(gate.promise).mockImplementation(async () => response(user()));
    vi.stubGlobal('fetch', fetchMock);
    const api = await import('../lib/api');
    const first = api.getCurrentUser({ fresh: true });
    const second = api.getCurrentUser({ fresh: true });
    const ordinary = api.getCurrentUser();
    gate.resolve(response(user()));
    expect(await Promise.all([first, second, ordinary])).toEqual([user(), user(), user()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await api.getCurrentUser({ fresh: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('starts a new fresh action check when an older ordinary identity read is pending', async () => {
    const ordinary = deferred<Response>();
    const fresh = deferred<Response>();
    const fetchMock = vi.fn().mockResolvedValueOnce(response(user('alice'))).mockReturnValueOnce(ordinary.promise).mockReturnValueOnce(fresh.promise);
    vi.stubGlobal('fetch', fetchMock);
    const api = await import('../lib/api');
    await api.getCurrentUser();
    vi.advanceTimersByTime(5_001);
    const old = api.getCurrentUser();
    const rejectOld = expect(old).rejects.toMatchObject({ code: 'CLIENT_SESSION_CHANGED' });
    const action = api.getCurrentUser({ fresh: true });
    const anotherAction = api.getCurrentUser({ fresh: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    fresh.resolve(response(user('bob')));
    expect(await action).toEqual(user('bob'));
    expect(await anotherAction).toEqual(user('bob'));
    ordinary.resolve(response(user('alice')));
    await rejectOld;
    expect(await api.getCurrentUser()).toEqual(user('bob'));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('reuses staggered mount/focus reads briefly and expires identity reuse', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => response(user()));
    vi.stubGlobal('fetch', fetchMock);
    const api = await import('../lib/api');
    await api.getCurrentUser();
    await api.getCurrentUser();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5_001);
    await api.getCurrentUser();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never delivers a superseded identity read after logout/account invalidation', async () => {
    const gate = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(gate.promise).mockImplementation(async () => response(user('bob')));
    vi.stubGlobal('fetch', fetchMock);
    const api = await import('../lib/api');
    const stale = api.getCurrentUser();
    const rejected = expect(stale).rejects.toMatchObject({ code: 'CLIENT_SESSION_CHANGED' });
    api.invalidateSessionClientCache();
    expect(await api.getCurrentUser()).toEqual(user('bob'));
    gate.resolve(response(user('alice')));
    await rejected;
    expect(await api.getCurrentUser()).toEqual(user('bob'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not reuse server module state between cookie sessions', async () => {
    vi.stubGlobal('window', undefined);
    const fetchMock = vi.fn().mockResolvedValueOnce(response(user('alice'))).mockResolvedValueOnce(response(user('bob')));
    vi.stubGlobal('fetch', fetchMock);
    const api = await import('../lib/api');
    expect(await api.getCurrentUser()).toEqual(user('alice'));
    expect(await api.getCurrentUser()).toEqual(user('bob'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('bounds a stalled shared identity read so an explicit retry can recover', async () => {
    const fetchMock = vi.fn().mockImplementationOnce((_path: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Read timed out', 'AbortError')));
    })).mockResolvedValueOnce(response(user()));
    vi.stubGlobal('fetch', fetchMock);
    const api = await import('../lib/api');
    let settled = false;
    const pending = api.getCurrentUser({ fresh: true }).catch(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(10_001);
    expect(settled).toBe(true);
    await pending;
    expect(await api.getCurrentUser({ fresh: true })).toEqual(user());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not let a superseded SESSION_INVALID response clear the replacement account', async () => {
    const old = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(old.promise).mockImplementation(async () => response(user('bob')));
    vi.stubGlobal('fetch', fetchMock);
    const api = await import('../lib/api');
    const pending = api.getCurrentUser();
    const rejected = expect(pending).rejects.toMatchObject({ status: 401 });
    api.invalidateSessionClientCache();
    await api.getCurrentUser();
    old.resolve(response({ error: { code: 'SESSION_INVALID', message: 'Expired old cookie' } }, 401));
    await rejected;
    expect(await api.getCurrentUser()).toEqual(user('bob'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('scoped research read reuse', () => {
  it.each(['getResearchObject', 'listVersions', 'getResearchIngestion', 'listResearchIngestionTasks'] as const)(
    '%s coalesces staggered readers and expires after a short TTL', async (helper) => {
      const gate = deferred<Response>();
      const fetchMock = vi.fn().mockReturnValueOnce(gate.promise).mockImplementation(async () => response({ versions: [], tasks: [], researchObjectId: 'ro', version: 2 }));
      vi.stubGlobal('fetch', fetchMock);
      const api = await import('../lib/api');
      const first = api[helper]('ro');
      const second = api[helper]('ro');
      gate.resolve(response({ versions: [], tasks: [], researchObjectId: 'ro', version: 1 }));
      await Promise.all([first, second]);
      await api[helper]('ro');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1_001);
      await api[helper]('ro');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it('bypasses completed reuse for explicit refresh but coalesces simultaneous refreshes', async () => {
    const gate = deferred<Response>();
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ versions: [{ versionId: 'old' }] })).mockReturnValueOnce(gate.promise);
    vi.stubGlobal('fetch', fetchMock);
    const api = await import('../lib/api');
    await api.listVersions('ro');
    const first = api.listVersions('ro', { fresh: true });
    const second = api.listVersions('ro', { fresh: true });
    gate.resolve(response({ versions: [{ versionId: 'new' }] }));
    expect((await first).versions[0].versionId).toBe('new');
    expect((await second).versions[0].versionId).toBe('new');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('invalidates reads at both write start and completion, including direct API writes', async () => {
    const write = deferred<Response>();
    let revision = 1;
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/csrf-token') return response({ csrfToken: 'test-token' });
      if (init?.method === 'PUT') return write.promise;
      return response({ researchObject: { version: revision } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const api = await import('../lib/api');
    await api.getResearchObject('ro');
    const mutation = api.apiRequest('/api/sdf/ro', { method: 'PUT', body: '{}' });
    await api.getResearchObject('ro'); // read while write is pending cannot survive its completion
    revision = 2;
    write.resolve(response({ ok: true }));
    await mutation;
    expect((await api.getResearchObject('ro')).researchObject.version).toBe(2);
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/research-objects/ro')).toHaveLength(3);
  });

  it('rejects an old pending read after a write so it cannot replace a newer result', async () => {
    const old = deferred<Response>();
    let reads = 0;
    vi.stubGlobal('fetch', vi.fn(async (path: string) => {
      if (path === '/api/csrf-token') return response({ csrfToken: 'test-token' });
      if (path.endsWith('/commits')) return response({ commit: { versionId: 'new' } });
      return ++reads === 1 ? old.promise : response({ versions: [{ versionId: 'new' }] });
    }));
    const api = await import('../lib/api');
    const pending = api.listVersions('ro');
    const rejected = expect(pending).rejects.toMatchObject({ name: 'RequestCacheInvalidatedError' });
    await api.apiRequest('/api/research-objects/ro/commits', { method: 'POST', body: '{}' });
    expect((await api.listVersions('ro')).versions[0].versionId).toBe('new');
    old.resolve(response({ versions: [{ versionId: 'old' }] }));
    await rejected;
    expect((await api.listVersions('ro')).versions[0].versionId).toBe('new');
    expect(reads).toBe(2);
  });

  it('clears private resolved and pending reads when identity changes without explicit login', async () => {
    const old = deferred<Response>();
    let actor = 'alice';
    vi.stubGlobal('fetch', vi.fn(async (path: string) => {
      if (path === '/api/auth/me') return response(user(actor));
      if (path.includes('/versions')) return old.promise;
      return response({ researchObject: { title: `${actor} private` } });
    }));
    const api = await import('../lib/api');
    await api.getCurrentUser();
    await api.getResearchObject('ro');
    const pending = api.listVersions('ro');
    const rejected = expect(pending).rejects.toMatchObject({ name: 'RequestCacheInvalidatedError' });
    actor = 'bob';
    await api.getCurrentUser({ fresh: true });
    expect((await api.getResearchObject('ro')).researchObject.title).toBe('bob private');
    old.resolve(response({ versions: [{ versionId: 'alice-secret' }] }));
    await rejected;
  });

  it.each(['login', 'logout'] as const)('clears private data after %s and keeps authorization at the API', async (action) => {
    let actor = 'alice';
    const fetchMock = vi.fn(async (path: string) => {
      if (path === '/api/csrf-token') return response({ csrfToken: 'test-token' });
      if (path === '/api/auth/login') { actor = 'bob'; return response({ userId: 'bob' }); }
      if (path === '/api/auth/logout') { actor = ''; return new Response(null, { status: 204 }); }
      if (path === '/api/auth/me') return response(user(actor));
      return actor ? response({ researchObject: { title: `${actor} private` } }) : response({ error: { code: 'SESSION_INVALID', message: 'Login required' } }, 401);
    });
    vi.stubGlobal('fetch', fetchMock);
    const api = await import('../lib/api');
    await api.getResearchObject('ro');
    if (action === 'login') {
      await api.loginWithPassword({ email: 'bob@example.test', password: 'fixture' });
      expect((await api.getResearchObject('ro')).researchObject.title).toBe('bob private');
    } else {
      await api.logout();
      await expect(api.getResearchObject('ro')).rejects.toMatchObject({ status: 401 });
    }
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/research-objects/ro')).toHaveLength(2);
  });

  it('does not cache denied or failed reads and isolates consumer changes', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ error: { code: 'FORBIDDEN', message: 'Denied' } }, 403))
      .mockImplementation(async () => response({ versions: [{ versionId: 'v1' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const api = await import('../lib/api');
    await expect(api.listVersions('ro')).rejects.toMatchObject({ status: 403 });
    const editable = await api.listVersions('ro');
    editable.versions.splice(0);
    expect((await api.listVersions('ro')).versions[0].versionId).toBe('v1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('bounds reuse across many RO keys without mixing their results', async () => {
    const fetchMock = vi.fn(async (path: string) => response({ researchObject: { id: path.split('/').at(-1) } }));
    vi.stubGlobal('fetch', fetchMock);
    const api = await import('../lib/api');
    for (let index = 0; index < 33; index++) await api.getResearchObject(`ro-${index}`);
    expect((await api.getResearchObject('ro-32')).researchObject.id).toBe('ro-32');
    expect(fetchMock).toHaveBeenCalledTimes(33);
    expect((await api.getResearchObject('ro-0')).researchObject.id).toBe('ro-0');
    expect(fetchMock).toHaveBeenCalledTimes(34);
  });

  it('clears data on SESSION_INVALID, including cached usage, rather than serving private reuse', async () => {
    let authenticated = true;
    const fetchMock = vi.fn(async (path: string) => path === '/api/usage'
      ? response({ user: [], workspaces: [] })
      : authenticated ? response(user()) : response({ error: { code: 'SESSION_INVALID', message: 'Expired' } }, 401));
    vi.stubGlobal('fetch', fetchMock);
    const api = await import('../lib/api');
    await api.getUsage();
    authenticated = false;
    await expect(api.getCurrentUser({ fresh: true })).rejects.toMatchObject({ status: 401 });
    await api.getUsage();
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/usage')).toHaveLength(2);
  });

  it('forwards the exact usage snapshot and supports explicit live refresh', async () => {
    const snapshot = { user: [{ resource: 'ai_credit', scope: 'global', limit: 100, used: 23, remaining: 77, allowed: true }], workspaces: [{ workspaceId: 'ws', items: [] }] };
    const fetchMock = vi.fn().mockImplementation(async () => response(snapshot));
    vi.stubGlobal('fetch', fetchMock);
    const api = await import('../lib/api');
    expect(await api.getUsage()).toEqual(snapshot);
    expect(await api.getUsage()).toEqual(snapshot);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await api.getUsage({ fresh: true })).toEqual(snapshot);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/usage', expect.objectContaining({ credentials: 'include', cache: 'no-store' }));
  });

  it('coalesces material recovery with other version/ingestion readers, including the snapshot', async () => {
    const fetchMock = vi.fn(async (path: string) => {
      if (path.endsWith('/versions')) return response({ versions: [{ versionId: 'v1' }] });
      if (path.endsWith('/ingestion')) return response({ tasks: [], version: 1 });
      return response({ version: { versionId: 'v1', snapshot: { artifacts: [{ artifactId: 'file', logicalPath: 'paper.pdf' }] } } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const api = await import('../lib/api');
    const { loadResearchMaterials } = await import('../lib/research-materials');
    const [first, second] = await Promise.all([loadResearchMaterials('ro'), loadResearchMaterials('ro'), api.listVersions('ro'), api.getResearchIngestion('ro')]);
    expect(first.artifacts).toEqual([{ artifactId: 'file', logicalPath: 'paper.pdf' }]);
    expect(second.artifacts).toEqual(first.artifacts);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('clears reads on failed writes because the server may have applied them', async () => {
    let revision = 1;
    vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/csrf-token') return response({ csrfToken: 'test-token' });
      if (init?.method === 'PUT') { revision = 2; throw new Error('Reply lost after apply'); }
      return response({ researchObject: { version: revision } });
    }));
    const api = await import('../lib/api');
    await api.getResearchObject('ro');
    await expect(api.apiRequest('/api/sdf/ro', { method: 'PUT', body: '{}' })).rejects.toThrow('Reply lost');
    expect((await api.getResearchObject('ro')).researchObject.version).toBe(2);
  });

  it('clears reads when a protected multipart upload starts and settles', async () => {
    let revision = 1;
    vi.stubGlobal('fetch', vi.fn(async (path: string) => path === '/api/csrf-token'
      ? response({ csrfToken: 'test-token' }) : response({ researchObject: { version: revision } })));
    const api = await import('../lib/api');
    const xhr = Object.assign(new EventTarget(), { open: vi.fn(), setRequestHeader: vi.fn(), withCredentials: false });
    await api.getResearchObject('ro');
    await api.prepareProtectedXhr(xhr, 'POST', '/api/research-objects/ro/ingest');
    revision = 2;
    expect((await api.getResearchObject('ro')).researchObject.version).toBe(2);
    revision = 3;
    xhr.dispatchEvent(new Event('loadend'));
    expect((await api.getResearchObject('ro')).researchObject.version).toBe(3);
  });
});

describe('CSRF reads across auth changes', () => {
  it('does not replay an old protected write after a CSRF reply crosses an account change', async () => {
    const firstReply = deferred<Response>();
    let writes = 0;
    const fetchMock = vi.fn(async (path: string) => {
      if (path === '/api/csrf-token') return response({ csrfToken: 'fixture-token' });
      return ++writes === 1 ? firstReply.promise : response({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);
    const api = await import('../lib/api');
    const mutation = api.apiRequest('/api/sdf/ro', { method: 'PUT', body: '{}' });
    await vi.advanceTimersByTimeAsync(0);
    expect(writes).toBe(1);
    api.invalidateSessionClientCache();
    firstReply.resolve(response({ error: { code: 'CSRF_INVALID', message: 'Old cookie token' } }, 403));
    await expect(mutation).rejects.toMatchObject({ code: 'CLIENT_SESSION_CHANGED' });
    expect(writes).toBe(1);
  });

  it('does not prepare an upload with a cached token when auth changes before the await resumes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ csrfToken: 'alice-token' })));
    const api = await import('../lib/api');
    await api.getCsrfToken();
    const xhr = { open: vi.fn(), setRequestHeader: vi.fn(), withCredentials: false };
    const upload = api.prepareProtectedXhr(xhr, 'POST', '/api/artifacts/upload');
    api.invalidateSessionClientCache();
    await expect(upload).rejects.toMatchObject({ code: 'CLIENT_SESSION_CHANGED' });
    expect(xhr.open).not.toHaveBeenCalled();
  });

  it('coalesces concurrent token acquisition and rejects a superseded token', async () => {
    const old = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(response({ csrfToken: 'bob-token' }));
    vi.stubGlobal('fetch', fetchMock);
    const api = await import('../lib/api');
    const first = api.getCsrfToken();
    const second = api.getCsrfToken();
    const rejectFirst = expect(first).rejects.toMatchObject({ code: 'CLIENT_SESSION_CHANGED' });
    const rejectSecond = expect(second).rejects.toMatchObject({ code: 'CLIENT_SESSION_CHANGED' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    api.invalidateSessionClientCache();
    expect(await api.getCsrfToken()).toBe('bob-token');
    old.resolve(response({ csrfToken: 'alice-token' }));
    await Promise.all([rejectFirst, rejectSecond]);
    expect(await api.getCsrfToken()).toBe('bob-token');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('identity and profile read reuse', () => {
  const profile = { identities: ['reader'], primaryIdentity: 'reader', disciplines: [], methods: [], topics: ['private-topic'], languages: [], acceptedSignals: [], rejectedSignals: [], profileVersion: 1 };
  const identity = { steps: { registered: true, emailVerified: true, orcidConnected: false, institutionEmailVerified: false }, credentials: [], scopedRoles: [], capabilities: { orcid: true, institutionEmail: true } };

  it.each(['getAcademicIdentityStatus', 'getResearchIdentity'] as const)('%s coalesces concurrent and staggered account loads', async (helper) => {
    const gate = deferred<Response>();
    const body = helper === 'getResearchIdentity' ? { profile } : identity;
    const expected = helper === 'getResearchIdentity' ? profile : identity;
    const fetchMock = vi.fn().mockReturnValueOnce(gate.promise).mockImplementation(async () => response(body));
    vi.stubGlobal('fetch', fetchMock);
    const api = await import('../lib/api');
    const first = api[helper]();
    const second = api[helper]();
    gate.resolve(response(body));
    expect(await first).toEqual(expected);
    expect(await second).toEqual(expected);
    expect(await api[helper]()).toEqual(expected);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await api[helper]({ fresh: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refreshes the profile after a PATCH and never reuses its pre-write fields', async () => {
    let version = 1;
    vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/csrf-token') return response({ csrfToken: 'fixture' });
      if (init?.method === 'PATCH') version++;
      return response({ profile: { ...profile, profileVersion: version } });
    }));
    const api = await import('../lib/api');
    expect((await api.getResearchIdentity()).profileVersion).toBe(1);
    await api.updateResearchIdentity({ expectedProfileVersion: 1, topics: ['replacement-topic'] });
    expect((await api.getResearchIdentity()).profileVersion).toBe(2);
  });

  it('clears an account private profile when auth invalidates', async () => {
    let actor = 'alice';
    vi.stubGlobal('fetch', vi.fn(async () => response({ profile: { ...profile, topics: [`${actor}-private-topic`] } })));
    const api = await import('../lib/api');
    expect((await api.getResearchIdentity()).topics).toEqual(['alice-private-topic']);
    api.invalidateSessionClientCache(); actor = 'bob';
    expect((await api.getResearchIdentity()).topics).toEqual(['bob-private-topic']);
  });
});
