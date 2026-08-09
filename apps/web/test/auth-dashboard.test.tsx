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
  'dashboard.research.status.draft': 'Draft',
  'createResearch.back': 'Dashboard',
  'createResearch.title': 'Create a research object',
  'createResearch.description': 'Start with a blank structured object or attach source material.',
  'createResearch.workspace': 'Workspace',
  'createResearch.workspaceLoading': 'Loading workspaces…',
  'createResearch.researchTitle': 'Research title',
  'createResearch.materials': 'Source materials',
  'createResearch.materialsHint': 'PDF, DOCX, TeX, Markdown and images',
  'createResearch.create': 'Create research object',
  'createResearch.evidenceTitle': 'Evidence before automation',
  'createResearch.evidenceBody': 'Evidence remains traceable.',
  'createResearch.stepStore': 'Store source artifacts',
  'createResearch.stepParse': 'Locate evidence',
  'createResearch.stepConfirm': 'Confirm every write',
};

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    if (key === 'dashboard.continue.version') return `Version ${String(values?.version ?? 3)}`;
    if (key === 'dashboard.continue.pending') return `${String(values?.count ?? 2)} items need attention`;
    return translations[`${namespace}.${key}`] ?? translations[key] ?? key;
  },
}));

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh: vi.fn(), push: vi.fn() }),
}));

import {
  confirmSignup,
  getCurrentUser,
  getDashboardOverview,
  loginWithPassword,
  requestSignupCode,
  safeReturnTo,
} from '../lib/api';
import { LoginForm } from '../components/auth/LoginForm';
import { SignupCodeForm, validateSignupPassword } from '../components/auth/SignupCodeForm';
import { ContinueResearch } from '../components/dashboard/ContinueResearch';
import { HermesTaskRail } from '../components/dashboard/HermesTaskRail';
import { ImportStage } from '../components/dashboard/ImportStage';
import { ResearchList } from '../components/dashboard/ResearchList';
import NewResearchObjectPage from '../app/research-objects/new/page';

afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockReset();
});

describe('auth API contract', () => {
  it('loads dashboard research and actionable tasks from real API routes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ researchObjects: [{ id: 'ro-1', title: 'Real RO', publicId: null, version: 1, status: 'draft' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tasks: [{ id: 'task-1', researchObjectId: 'ro-1', kind: 'sdf.extract', status: 'pending', progress: 10 }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getDashboardOverview()).resolves.toMatchObject({
      researchObjects: [{ id: 'ro-1' }],
      tasks: [{ id: 'task-1' }],
    });
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/research-objects?limit=20', expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/agent/tasks?actionable=true', expect.any(Object));
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
    expect(markup).toContain('href="/research-objects/ro-1/edit"');
    expect(markup).toContain('data-continuation-priority="primary"');
  });

  it('keeps upload and blank creation at equal primary priority', () => {
    const markup = renderToStaticMarkup(createElement(ImportStage, { compact: false }));

    expect(markup).toContain('href="/research-objects/new?mode=import"');
    expect(markup).toContain('href="/research-objects/new?mode=blank"');
    expect(markup.match(/data-action-priority="primary"/g)).toHaveLength(2);
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

  it('renders recent research as a semantic list with status text', () => {
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
          },
        ],
      }),
    );

    expect(markup).toContain('<ul');
    expect(markup).toContain('Transient-state spectroscopy');
    expect(markup).toContain('Draft');
  });
});
