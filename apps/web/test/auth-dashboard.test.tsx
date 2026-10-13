import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const translations: Record<string, string> = {
  'register.title': 'Create your research account',
  'register.description': 'Use your institutional or personal email.',
  'register.displayName': 'Display name',
  'register.email': 'Email',
  'register.password': 'Password',
  'register.passwordHint': 'Use at least 8 characters with a letter and a number.',
  'register.requestCode': 'Send verification code',
  'register.code': 'Verification code',
  'register.confirm': 'Create account',
  'register.resend': 'Resend code',
  'register.resendIn': 'Resend in 60s',
  'register.haveAccount': 'Already have an account?',
  'register.login': 'Log in',
  'login.title': 'Welcome back',
  'login.description': 'Return to your research workspace.',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.submit': 'Log in',
  'login.noAccount': 'New to OpenScience?',
  'login.register': 'Create account',
  'dashboard.continue.title': 'Continue research',
  'dashboard.continue.emptyTitle': 'Import your first research material',
  'dashboard.continue.emptyBody': 'Hermes will preserve source evidence before proposing SDF fields.',
  'dashboard.continue.open': 'Continue research',
  'dashboard.continue.version': 'Version 3',
  'dashboard.continue.pending': '2 items need attention',
  'dashboard.import.title': 'Start a research object',
  'dashboard.import.description': 'Bring existing material or begin with a blank structured object.',
  'dashboard.import.upload': 'Upload materials',
  'dashboard.import.blank': 'Create blank RO',
  'dashboard.hermes.title': 'Hermes tasks',
  'dashboard.hermes.empty': 'No tasks need your attention.',
  'dashboard.hermes.review': 'Review evidence',
  'dashboard.hermes.retry': 'Retry task',
  'dashboard.research.title': 'Your research',
  'dashboard.research.empty': 'No research objects yet.',
  'dashboard.research.search': 'Search research objects',
  'dashboard.research.draftRevision': 'Private draft',
  'dashboard.research.status.draft': 'Draft',
  'createResearch.back': 'Dashboard',
  'createResearch.title': 'Create a research object',
  'createResearch.description': 'Start with a blank structured object or attach source material.',
  'createResearch.workspace': 'Workspace',
  'createResearch.workspaceLoading': 'Loading workspaces…',
  'createResearch.researchTitle': 'Research title',
  'createResearch.materials': 'Source materials',
  'createResearch.materialsHint': 'PDF, DOCX, TeX, Markdown and images',
  'createResearch.materialsRequired': 'Choose at least one source file',
  'createResearch.create': 'Create research object',
  'createResearch.evidenceTitle': 'Evidence before automation',
  'createResearch.evidenceBody': 'Evidence remains traceable.',
  'createResearch.stepStore': 'Store source artifacts',
  'createResearch.stepParse': 'Locate evidence',
  'createResearch.stepConfirm': 'Confirm every write',
};

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    if (key === 'dashboard.continue.version') return `Version ${String(values?.version ?? 3)}`;
    if (key === 'dashboard.continue.pending') return `${String(values?.count ?? 2)} items need attention`;
    return translations[`${namespace}.${key}`] ?? translations[key] ?? key;
  },
}));

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/research-objects/new',
  useRouter: () => ({ replace, refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('mode=import'),
}));

import {
  confirmSignup,
  createResearchObjectWithMaterials,
  getCurrentUser,
  getDashboardOverview,
  loginWithPassword,
  requestSignupCode,
  planMaterialLogicalPaths,
  safeReturnTo,
} from '../lib/api';
import DefaultLoginForm, { LoginForm } from '../components/auth/LoginForm';
import { ResearchIdentityPanel } from '../components/auth/ResearchIdentityPanel';
import { SignupCodeForm, validateSignupPassword } from '../components/auth/SignupCodeForm';
import { applyProfileTokenDraft } from '../components/auth/ResearchProfileFields';
import { ContinueResearch } from '../components/dashboard/ContinueResearch';
import { ResearchWorkspaceNav } from '../components/research/ResearchWorkspaceNav';
import { HermesTaskRail } from '../components/dashboard/HermesTaskRail';
import { ImportStage } from '../components/dashboard/ImportStage';
import { CurrentResearchCard, ResearchList, VersionLabels, summarizeDashboardVersions, dashboardPublicationHref, filterDashboardResearch, formatDashboardUpdate, loadDashboardVersionMetadata } from '../components/dashboard/ResearchList';
import * as SessionHooks from '../components/auth/SessionProvider';
import NewResearchObjectPage from '../app/research-objects/new/page';

afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockReset();
  vi.restoreAllMocks();
});

describe('research continuation', () => {
  it('keeps Hermes discoverable inside the RO with its own active navigation state', () => {
    const markup = renderToStaticMarkup(createElement(ResearchWorkspaceNav, { active: 'hermes', objectId: 'ro-a' }));
    expect(markup).toContain('href="/research-objects/ro-a/hermes"');
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
  });
  const research = { id: 'ro-a', title: 'Current research', publicId: 'OSR-A', versionNo: 1, status: 'draft', pendingCount: 2 };
  const task = (id: string, researchObjectId: string, state: string) => ({ id, researchObjectId, state, researchTitle: 'Research', logicalPath: 'paper.pdf', retryCount: 0, error: null });
  it('continues the current RO review before other pending work', () => {
    const markup = renderToStaticMarkup(createElement(ContinueResearch, { research, tasks: [task('foreign', 'ro-b', 'needs_review'), task('failed', 'ro-a', 'failed_retryable'), task('review', 'ro-a', 'needs_review')] }));
    expect(markup).toContain('/research-objects/ro-a/edit?ingestionTask=review');
    expect(markup).not.toContain('task=foreign');
  });
  it('opens the task hub when attention is required but no task detail is loaded', () => {
    const markup = renderToStaticMarkup(createElement(ContinueResearch, { research }));
    expect(markup).toContain('href="/research-objects/ro-a/hermes"');
  });
  it('keeps the editor as the next step when no work needs attention', () => {
    const markup = renderToStaticMarkup(createElement(ContinueResearch, { research: { ...research, pendingCount: 0 }, tasks: [task('done', 'ro-a', 'confirmed')] }));
    expect(markup).toContain('href="/research-objects/ro-a/edit"');
    expect(markup).not.toContain('task=done');
  });
});

describe('auth API contract', () => {
  it('preserves a trailing separator while entering a second research-interest token', () => {
    const afterComma = applyProfileTokenDraft('physics,');
    expect(afterComma).toEqual({ draft: 'physics,', tokens: ['physics'] });
    expect(applyProfileTokenDraft(`${afterComma.draft} optics`)).toEqual({
      draft: 'physics, optics', tokens: ['physics', 'optics'],
    });
  });
  it('retains the rolling-sync default LoginForm export', () => {
    const markup = renderToStaticMarkup(createElement(DefaultLoginForm, { returnTo: '/dashboard' }));
    expect(markup).toContain('data-auth-flow="login"');
  });

  it('attaches every selected source file to the initial research-object commit', async () => {
    const create = vi.fn().mockResolvedValue({ researchObject: { id: 'ro-1', workspaceId: 'ws-1', version: 1 } });
    const upload = vi
      .fn()
      .mockResolvedValueOnce({ logicalPath: 'paper.pdf', artifactId: 'artifact-1' })
      .mockResolvedValueOnce({ logicalPath: 'figure.png', artifactId: 'artifact-2' });
    const commit = vi.fn().mockResolvedValue({ commit: { commitId: 'commit-1' } });
    const materials = [new File(['paper'], 'paper.pdf'), new File(['figure'], 'figure.png')];

    await createResearchObjectWithMaterials(
      { workspaceId: 'ws-1', title: 'Imported study' },
      materials,
      { create, upload, commit },
    );

    expect(upload).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenCalledWith(
      'ro-1',
      expect.objectContaining({
        version: 1,
        artifacts: [
          { logicalPath: 'paper.pdf', artifactId: 'artifact-1' },
          { logicalPath: 'figure.png', artifactId: 'artifact-2' },
        ],
      }),
      expect.any(String),
    );
  });

  it('deterministically disambiguates duplicate source filenames before upload', () => {
    const files = [new File(['a'], 'paper.pdf'), new File(['b'], 'paper.pdf'), new File(['c'], 'paper (2).pdf')];
    expect(planMaterialLogicalPaths(files)).toEqual(['paper.pdf', 'paper (2).pdf', 'paper (2) (2).pdf']);
  });

  it('resumes from the last import checkpoint without creating a second RO or re-uploading completed files', async () => {
    const materials = [new File(['paper'], 'paper.md'), new File(['figure'], 'figure.png')];
    const create = vi.fn().mockResolvedValue({ researchObject: { id: 'ro-1', workspaceId: 'ws-1', version: 1 } });
    const firstUpload = vi
      .fn()
      .mockResolvedValueOnce({ logicalPath: 'paper.md', artifactId: 'artifact-1' })
      .mockRejectedValueOnce(new Error('network interrupted'));
    let checkpoint: Parameters<typeof createResearchObjectWithMaterials>[3] = undefined;

    await expect(createResearchObjectWithMaterials(
      { workspaceId: 'ws-1', title: 'Recovered study' },
      materials,
      { create, upload: firstUpload, commit: vi.fn() },
      undefined,
      (next) => { checkpoint = next; },
    )).rejects.toThrow('network interrupted');

    const resumedUpload = vi.fn().mockResolvedValue({ logicalPath: 'figure.png', artifactId: 'artifact-2' });
    const commit = vi.fn().mockResolvedValue({ commit: { commitId: 'commit-1' } });
    await createResearchObjectWithMaterials(
      { workspaceId: 'ws-1', title: 'Recovered study' },
      materials,
      { create, upload: resumedUpload, commit },
      checkpoint,
      (next) => { checkpoint = next; },
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(resumedUpload).toHaveBeenCalledTimes(1);
    expect(resumedUpload).toHaveBeenCalledWith('ws-1', materials[1], 'figure.png', expect.stringMatching(/:upload:1:[a-f0-9]{64}$/));
    expect(commit).toHaveBeenCalledOnce();
  });

  it('starts a new import when a reselected same-name file has different content', async () => {
    const create = vi.fn()
      .mockResolvedValueOnce({ researchObject: { id: 'ro-old', workspaceId: 'ws-1', version: 1 } })
      .mockResolvedValueOnce({ researchObject: { id: 'ro-new', workspaceId: 'ws-1', version: 1 } });
    let checkpoint: Parameters<typeof createResearchObjectWithMaterials>[3] = undefined;
    await expect(createResearchObjectWithMaterials(
      { workspaceId: 'ws-1', title: 'Same title', mode: 'import' },
      [new File(['old'], 'paper.md')],
      { create, upload: vi.fn().mockRejectedValue(new Error('offline')), commit: vi.fn() },
      undefined,
      (next) => { checkpoint = next; },
    )).rejects.toThrow('offline');

    const upload = vi.fn().mockResolvedValue({ logicalPath: 'paper.md', artifactId: 'artifact-new' });
    await createResearchObjectWithMaterials(
      { workspaceId: 'ws-1', title: 'Same title', mode: 'import' },
      [new File(['new'], 'paper.md')],
      { create, upload, commit: vi.fn().mockResolvedValue({ commit: { commitId: 'commit-new' } }) },
      checkpoint,
    );

    expect(create).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenCalledWith('ws-1', expect.any(File), 'paper.md', expect.stringMatching(/:upload:0:[a-f0-9]{64}$/));
  });

  it('loads dashboard research and actionable tasks from real API routes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ researchObjects: [{ id: 'ro-1', title: 'Real RO', publicId: null, version: 1, status: 'draft' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tasks: [{ id: 'task-1', researchObjectId: 'ro-1', researchTitle: 'Real RO', logicalPath: 'paper.pdf', state: 'queued', retryCount: 0, error: null }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getDashboardOverview()).resolves.toMatchObject({
      researchObjects: [{ id: 'ro-1' }],
      tasks: [{ id: 'task-1' }],
    });
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/research-objects?limit=20', expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/ingestion?actionable=true', expect.any(Object));
  });

  it('requests and confirms code signup without sending an invitation code', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 202 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ userId: 'user-1', status: 'email_verified' }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await requestSignupCode({ email: 'researcher@example.com' });
    await confirmSignup({
      email: 'researcher@example.com',
      code: '123456',
      password: 'Method123',
      displayName: 'Ada Researcher',
      researchIdentity: {
        identities: ['author', 'reviewer'],
        primaryIdentity: 'author',
        disciplines: ['physics'],
        methods: ['spectroscopy'],
        topics: ['ultrafast optics'],
        languages: ['en'],
      },
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/auth/request-signup-code',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'researcher@example.com' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/auth/confirm-signup',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'researcher@example.com',
          code: '123456',
          password: 'Method123',
          displayName: 'Ada Researcher',
          researchIdentity: {
            identities: ['author', 'reviewer'],
            primaryIdentity: 'author',
            disciplines: ['physics'],
            methods: ['spectroscopy'],
            topics: ['ultrafast optics'],
            languages: ['en'],
          },
        }),
      }),
    );
    expect(fetchMock.mock.calls[1][1].body).not.toContain('invitation');
  });

  it('logs in and resolves the current user through the existing session cookie contract', async () => {
    const me = {
      userId: 'user-1',
      email: 'researcher@example.com',
      displayName: 'Ada Researcher',
      status: 'email_verified',
      level: 'free',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ userId: me.userId, status: me.status }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(me), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await loginWithPassword({ email: me.email, password: 'Method123' });
    await expect(getCurrentUser()).resolves.toEqual(me);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/auth/login',
      expect.objectContaining({ credentials: 'include', method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/auth/me',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('accepts only local return paths and preserves their query string', () => {
    expect(safeReturnTo('/dashboard?focus=tasks')).toBe('/dashboard?focus=tasks');
    expect(safeReturnTo('https://attacker.example/steal')).toBe('/dashboard');
    expect(safeReturnTo('//attacker.example/steal')).toBe('/dashboard');
    expect(safeReturnTo('/\\attacker.example/steal')).toBe('/dashboard');
    expect(safeReturnTo('/\u0000attacker.example/steal')).toBe('/dashboard');
    expect(safeReturnTo('/auth/login')).toBe('/dashboard');
  });
});

describe('code-based auth forms', () => {
  it('enforces the server password baseline before a code can be requested', () => {
    expect(validateSignupPassword('short')).toEqual(['length', 'number']);
    expect(validateSignupPassword('longpassword')).toEqual(['number']);
    expect(validateSignupPassword('12345678')).toEqual(['letter']);
    expect(validateSignupPassword('Method123')).toEqual([]);
  });

  it('renders accessible auth controls with no invitation-code field', () => {
    const signup = renderToStaticMarkup(createElement(SignupCodeForm, { returnTo: '/dashboard' }));
    const login = renderToStaticMarkup(createElement(LoginForm, { returnTo: '/dashboard' }));

    expect(signup).toContain('type="email"');
    expect(signup).toContain('type="password"');
    expect(signup).toContain('aria-describedby="signup-password-hint"');
    expect(signup).toContain('aria-live="polite"');
    expect(signup).not.toMatch(/invitation|invite code/i);
    expect(login).toContain('autoComplete="current-password"');
    expect(login).toContain('aria-live="polite"');
  });

  it('uses the rule-based research identity surface instead of a generic auth card', () => {
    const context = renderToStaticMarkup(createElement(ResearchIdentityPanel, {
      eyebrow: 'Research identity / 01',
      title: 'Evidence begins with a verifiable author.',
      description: 'The same identity follows every version and review.',
      intent: 'create',
      tagline: 'Identity, provenance, continuity',
    }));
    const signup = renderToStaticMarkup(createElement(SignupCodeForm, { returnTo: '/research-objects/new' }));
    const login = renderToStaticMarkup(createElement(LoginForm, { returnTo: '/dashboard' }));

    expect(context).toContain('data-research-identity-context="create"');
    expect(context).not.toContain('<img');
    expect(context).toContain('<h2');
    expect(signup).toContain('data-auth-flow="signup-code"');
    expect(login).toContain('data-auth-flow="login"');
    expect(signup).not.toContain('rounded-card');
    expect(login).not.toContain('rounded-card');
  });

});

describe('dashboard product states', () => {
  it('renders a reachable creation/import destination for both dashboard actions', () => {
    const markup = renderToStaticMarkup(createElement(NewResearchObjectPage));
    expect(markup).toContain('Create a research object');
    expect(markup).toContain('name="title"');
    expect(markup).toContain('type="file"');
  });

  it('makes first-use import the primary continuation', () => {
    const markup = renderToStaticMarkup(createElement(ContinueResearch, { research: null }));

    expect(markup).toContain('Import your first research material');
    expect(markup).toContain('href="/research-objects/new?mode=import"');
  });

  it('makes the most recent RO the returning-user primary', () => {
    const markup = renderToStaticMarkup(
      createElement(ContinueResearch, {
        research: {
          id: 'ro-1',
          publicId: 'OSR-2026-000123',
          title: 'Transient-state spectroscopy',
          versionNo: 3,
          status: 'draft',
          pendingCount: 2,
        },
      }),
    );

    expect(markup).toContain('Transient-state spectroscopy');
    expect(markup).toContain('OSR-2026-000123');
    expect(markup).toContain('href="/research-objects/ro-1/hermes"');
    expect(markup).toContain('data-continuation-priority="primary"');
  });

  it('makes material import primary and keeps blank creation available as a secondary action', () => {
    const markup = renderToStaticMarkup(createElement(ImportStage, { compact: false }));

    expect(markup).toContain('href="/research-objects/new?mode=import"');
    expect(markup).toContain('href="/research-objects/new?mode=blank"');
    expect(markup.match(/data-action-priority="primary"/g)).toHaveLength(1);
    expect(markup.match(/data-action-priority="secondary"/g)).toHaveLength(1);
  });

  it('shows only actionable Hermes tasks with the action appropriate to their state', () => {
    const markup = renderToStaticMarkup(
      createElement(HermesTaskRail, {
        tasks: [
          {
            id: 'review-1',
            researchObjectId: 'ro-1',
            title: 'Methods evidence',
            status: 'needs_review',
            current: 4,
            total: 6,
          },
          {
            id: 'done-1',
            researchObjectId: 'ro-2',
            title: 'Already written',
            status: 'written',
            current: 6,
            total: 6,
          },
        ],
      }),
    );

    expect(markup).toContain('Methods evidence');
    expect(markup).toContain('href="/research-objects/ro-1/hermes?task=review-1"');
    expect(markup).toContain('Review evidence');
    expect(markup).not.toContain('Already written');
  });

  it.each(['queued', 'running', 'failed_retryable', 'failed_blocked'] as const)('opens the existing read-only task view for %s work', (status) => {
    const markup = renderToStaticMarkup(createElement(HermesTaskRail, {
      tasks: [{ id: 'task-1', researchObjectId: 'ro-1', title: 'Research material', status, current: 0, total: 6 }],
    }));
    expect(markup).toContain('href="/research-objects/ro-1/hermes?task=task-1"');
    expect(markup).not.toContain('/ingest?task=');
    expect(markup).toContain('hermes.view');
    expect(markup).not.toContain('hermes.retry');
  });

  it('renders recent research as a semantic list without guessing publication state', () => {
    const markup = renderToStaticMarkup(
      createElement(ResearchList, {
        researchObjects: [
          {
            id: 'ro-1',
            publicId: 'OSR-2026-000123',
            title: 'Transient-state spectroscopy',
            versionNo: 3,
            status: 'draft',
            pendingCount: 0,
            updatedAt: '2026-10-12T10:00:00.000Z',
          },
        ],
      }),
    );

    expect(markup).toContain('<ul');
    expect(markup).toContain('Transient-state spectroscopy');
    expect(markup).toContain('Loading versions');
    expect(markup).not.toContain('>Private draft<');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('dateTime="2026-10-12T10:00:00.000Z"');
  });
});

describe('P04 current research metadata', () => {
  const research = { id: 'ro-a', publicId: 'OSR-A', title: 'Working research', versionNo: 12, status: 'draft', pendingCount: 0, updatedAt: '2026-10-12T10:00:00.000Z' };
  function authorize() {
    vi.spyOn(SessionHooks, 'useSession').mockReturnValue({ managed: true, status: 'authenticated', user: { userId: 'owner-a', email: 'researcher@example.invalid', displayName: 'Researcher', status: 'active', level: 'basic' }, refresh: vi.fn() });
  }
  it('keeps content and scientific media out of the current card while versions are loading', () => {
    authorize();
    const markup = renderToStaticMarkup(createElement(CurrentResearchCard, { research, ownerId: 'owner-a' }));
    expect(markup).toContain('Working research');
    expect(markup).toContain('Loading versions');
    expect(markup).not.toContain('data-media-state');
    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('/research/OSR-A/v/12');
    expect(markup).toContain('/research-objects/ro-a/overview');
  });
  it('preserves the actual review task as the primary action ahead of failed and foreign tasks', () => {
    authorize();
    const task = (id: string, researchObjectId: string, state: string) => ({ id, researchObjectId, state, researchTitle: 'Research', logicalPath: 'paper.pdf', retryCount: 0, error: null });
    const markup = renderToStaticMarkup(createElement(CurrentResearchCard, { research, ownerId: 'owner-a', tasks: [task('foreign', 'ro-b', 'needs_review'), task('failed', 'ro-a', 'failed_retryable'), task('review', 'ro-a', 'needs_review')] }));
    expect(markup).toContain('/research-objects/ro-a/edit?ingestionTask=review');
    expect(markup).not.toContain('ingestionTask=foreign');
    expect(markup).not.toContain('ingestionTask=failed');
  });
  it('does not render another account current card', () => {
    authorize();
    expect(renderToStaticMarkup(createElement(CurrentResearchCard, { research, ownerId: 'owner-b' }))).toBe('');
  });
  const version = (versionNo: number, status: string, publicationNo: number | null = null) => ({
    versionId: `version-${versionNo}`, versionNo, status, publicationNo, commitId: `commit-${versionNo}`, createdAt: '2026-10-01T00:00:00.000Z',
  });
  it('preserves public v4 while the latest saved snapshot is a private revision', () => {
    const metadata = summarizeDashboardVersions([version(5, 'draft'), version(2, 'published', 4), version(1, 'published', 1)]);
    expect(metadata.latest?.versionNo).toBe(5);
    expect(metadata.privateDraft?.versionNo).toBe(5);
    expect(metadata.published?.publicationNo).toBe(4);
    expect(dashboardPublicationHref(research, metadata)).toBe('/research/OSR-A/v/4');
    expect(dashboardPublicationHref({ publicId: 'DRAFT-ro-a' }, metadata)).toBeUndefined();
    expect(dashboardPublicationHref(research)).toBeUndefined();
  });
  it('does not turn object revisions, withdrawn records or incomplete publication metadata into public links', () => {
    for (const metadata of [summarizeDashboardVersions([version(12, 'draft')]),
      summarizeDashboardVersions([version(12, 'published')]), summarizeDashboardVersions([version(12, 'withdrawn', 4)])]) {
      expect(dashboardPublicationHref(research, metadata)).toBeUndefined();
    }
    expect(summarizeDashboardVersions([version(12, 'restricted', 4)]).privateDraft).toBeUndefined();
  });
  it.each(['withdrawn', 'restricted'])('keeps the newest publication %s state beside a private draft without substituting an older public version', status => {
    const metadata = summarizeDashboardVersions([version(5, 'draft'), version(4, status, 3), version(1, 'published', 1)]);
    expect(metadata.privateDraft?.versionNo).toBe(5);
    expect(metadata.publication?.publicationNo).toBe(3);
    expect(metadata.publication?.status).toBe(status);
    expect(metadata.published).toBeUndefined();
    expect(dashboardPublicationHref(research, metadata)).toBeUndefined();
    expect(filterDashboardResearch([research], 'private', { 'ro-a': metadata })).toHaveLength(1);
    expect(filterDashboardResearch([research], 'published', { 'ro-a': metadata })).toHaveLength(0);
  });
  it.each([
    ['en', 'withdrawn', 'Withdrawn'], ['en', 'restricted', 'Public content restricted'],
    ['zh', 'withdrawn', '已撤回'], ['zh', 'restricted', '公开内容受限'],
  ])('renders the actual %s copy for %s beside the working draft', (locale, status, expected) => {
    const metadata = summarizeDashboardVersions([version(5, 'draft'), version(4, status, 3)]);
    const markup = renderToStaticMarkup(createElement(VersionLabels, { state: { scope: 'current', metadata }, locale }));
    expect(markup).toContain(expected);
    expect(markup).toContain(locale === 'zh' ? '私有修订草稿' : 'Private revision draft');
    expect(markup).not.toContain('research.status.');
  });
  it('allows a research object in both filters and leaves unknown rows only in all research', () => {
    const rows = [research, { ...research, id: 'unknown' }, { ...research, id: 'private' }];
    const metadata = {
      'ro-a': summarizeDashboardVersions([version(5, 'draft'), version(2, 'published', 4)]),
      private: summarizeDashboardVersions([version(3, 'draft')]),
    };
    expect(filterDashboardResearch(rows, 'all', metadata).map(row => row.id)).toEqual(['ro-a', 'unknown', 'private']);
    expect(filterDashboardResearch(rows, 'private', metadata).map(row => row.id)).toEqual(['ro-a', 'private']);
    expect(filterDashboardResearch(rows, 'published', metadata).map(row => row.id)).toEqual(['ro-a']);
  });
  it('includes a real unsaved private draft only after an empty version read succeeds', () => {
    const unsaved = { ...research, id: 'unsaved', publicId: 'DRAFT-unsaved', visibility: 'private', status: 'draft' };
    const rows = [unsaved, { ...unsaved, id: 'unknown' }, { ...unsaved, id: 'failed' },
      { ...unsaved, id: 'public', visibility: 'public' }, { ...unsaved, id: 'published', status: 'published' },
      { ...unsaved, id: 'missing-visibility', visibility: undefined }];
    const empty = summarizeDashboardVersions([]);
    const metadata = { unsaved: empty, unknown: undefined, failed: undefined, public: empty, published: empty, 'missing-visibility': empty };
    expect(filterDashboardResearch(rows, 'private', metadata).map(row => row.id)).toEqual(['unsaved']);
    expect(filterDashboardResearch(rows, 'published', metadata)).toEqual([]);
    expect(filterDashboardResearch(rows, 'all', metadata).map(row => row.id)).toEqual(rows.map(row => row.id));
    expect(empty.latest).toBeUndefined();
    expect(empty.privateDraft).toBeUndefined();
  });
  it('formats only a real parseable update time and never manufactures a date', () => {
    expect(formatDashboardUpdate('2026-10-12T10:00:00.000Z', 'en')?.dateTime).toBe('2026-10-12T10:00:00.000Z');
    expect(formatDashboardUpdate('2026-10-12T10:00:00.000Z', 'zh')?.label).toContain('2026');
    expect(formatDashboardUpdate(undefined, 'en')).toBeNull();
    expect(formatDashboardUpdate('', 'zh')).toBeNull();
    expect(formatDashboardUpdate('not-a-date', 'en')).toBeNull();
  });
  it('does not render supplied research rows from a different authenticated owner', () => {
    authorize();
    const markup = renderToStaticMarkup(createElement(ResearchList, { researchObjects: [research], ownerId: 'owner-b' }));
    expect(markup).not.toContain('Working research');
    expect(markup).not.toContain('/research-objects/ro-a/edit');
  });
  it('loads only version metadata with at most two pending reads', async () => {
    let finishFirst!: (response: Response) => void;
    let finishSecond!: (response: Response) => void;
    const first = new Promise<Response>(resolve => { finishFirst = resolve; });
    const second = new Promise<Response>(resolve => { finishSecond = resolve; });
    const fetch = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second)
      .mockResolvedValueOnce(new Response(JSON.stringify({ versions: [version(3, 'draft')] }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const results: string[] = [];
    const loaded = loadDashboardVersionMetadata([{ id: 'one', scope: 'one:1' }, { id: 'two', scope: 'two:1' }, { id: 'three', scope: 'three:1' }], () => true, id => results.push(id));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.map(call => call[0])).toEqual(['/api/research-objects/one/versions', '/api/research-objects/two/versions']);
    finishFirst(new Response(JSON.stringify({ versions: [version(5, 'draft')] }), { status: 200 }));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    finishSecond(new Response(JSON.stringify({ versions: [version(2, 'published', 4)] }), { status: 200 }));
    await loaded;
    expect(results.sort()).toEqual(['one', 'three', 'two']);
    expect(fetch.mock.calls.map(call => call[0])).toEqual(['/api/research-objects/one/versions', '/api/research-objects/two/versions', '/api/research-objects/three/versions']);
  });
  it('reuses the original read cache for list metadata while an explicit retry reads fresh', async () => {
    vi.stubGlobal('window', {});
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ versions: [version(5, 'draft')] }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const rows = [{ id: 'original-cache-reuse', scope: 'owner-a:original-cache-reuse:1' }];
    const received = vi.fn();
    await loadDashboardVersionMetadata(rows, () => true, received, { fresh: true });
    await loadDashboardVersionMetadata(rows, () => true, received);
    expect(fetch).toHaveBeenCalledTimes(1);
    await loadDashboardVersionMetadata(rows, () => true, received, { fresh: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(received).toHaveBeenCalledTimes(3);
  });
  it('drops late metadata and stops queued reads when the owner or result scope changes', async () => {
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>(resolve => { finish = resolve; });
    const fetch = vi.fn().mockReturnValue(pending);
    vi.stubGlobal('fetch', fetch);
    let active = true;
    const received = vi.fn();
    const loaded = loadDashboardVersionMetadata([{ id: 'one', scope: 'owner-a:one:1' }, { id: 'two', scope: 'owner-a:two:1' }, { id: 'three', scope: 'owner-a:three:1' }], () => active, received);
    expect(fetch).toHaveBeenCalledTimes(2);
    active = false;
    finish(new Response(JSON.stringify({ versions: [version(5, 'draft')] }), { status: 200 }));
    await loaded;
    expect(received).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('keeps other research metadata usable when one version read fails', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'TEMPORARY', message: 'Unavailable' } }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ versions: [version(5, 'draft')] }), { status: 200 })));
    const received = vi.fn();
    await loadDashboardVersionMetadata([{ id: 'failed', scope: 'failed:1' }, { id: 'ready', scope: 'ready:1' }], () => true, received);
    expect(received).toHaveBeenCalledWith('failed', { scope: 'failed:1', failed: true });
    expect(received).toHaveBeenCalledWith('ready', expect.objectContaining({ scope: 'ready:1', metadata: expect.objectContaining({ privateDraft: expect.objectContaining({ versionNo: 5 }) }) }));
  });
});
