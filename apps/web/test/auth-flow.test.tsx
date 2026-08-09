import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

beforeEach(() => vi.clearAllMocks());

describe('identity redirect and error contract', () => {
  it('accepts only same-origin relative next paths', async () => {
    const { safeNextPath } = await import('../lib/auth');
    expect(safeNextPath('/research-objects/new', '/dashboard')).toBe('/research-objects/new');
    expect(safeNextPath('https://attacker.example/steal', '/dashboard')).toBe('/dashboard');
    expect(safeNextPath('//attacker.example/steal', '/dashboard')).toBe('/dashboard');
    expect(safeNextPath('/login?next=https://attacker.example', '/dashboard')).toBe('/login?next=https://attacker.example');
  });

  it('maps server auth codes without exposing raw diagnostics', async () => {
    const { authErrorKey } = await import('../lib/auth');
    expect(authErrorKey('INVITATION_INVALID')).toBe('errors.invitationInvalid');
    expect(authErrorKey('ACCOUNT_NOT_ACTIVE')).toBe('errors.accountNotActive');
    expect(authErrorKey('RATE_LIMITED')).toBe('errors.rateLimited');
    expect(authErrorKey('SOME_INTERNAL_PROVIDER_ERROR')).toBe('errors.unknown');
  });
});

describe('identity surfaces', () => {
  it('renders a complete login form and registration path', async () => {
    const { default: LoginForm } = await import('../components/auth/LoginForm');
    const markup = renderToStaticMarkup(createElement(LoginForm, { nextPath: '/dashboard' }));

    expect(markup).toContain('data-auth-form="login"');
    expect(markup).toContain('type="email"');
    expect(markup).toContain('type="password"');
    expect(markup).toContain('autoComplete="email"');
    expect(markup).toContain('autoComplete="current-password"');
    expect(markup).toContain('href="/register?next=%2Fdashboard"');
    expect(markup).toContain('aria-live="polite"');
  });

  it('requires invitation identity and explains the password policy', async () => {
    const { default: RegisterForm } = await import('../components/auth/RegisterForm');
    const markup = renderToStaticMarkup(createElement(RegisterForm, { nextPath: '/research-objects/new' }));

    expect(markup).toContain('data-auth-form="register"');
    expect(markup).toContain('name="invitationCode"');
    expect(markup).toContain('name="displayName"');
    expect(markup).toContain('autoComplete="new-password"');
    expect(markup).toContain('passwordHelp');
    expect(markup).toContain('href="/login?next=%2Fresearch-objects%2Fnew"');
  });

  it('renders six-digit verification and a resend action', async () => {
    const { default: VerifyEmailForm } = await import('../components/auth/VerifyEmailForm');
    const markup = renderToStaticMarkup(createElement(VerifyEmailForm, {
      email: 'researcher@example.org',
      nextPath: '/dashboard',
    }));

    expect(markup).toContain('data-auth-form="verify"');
    expect(markup).toContain('researcher@example.org');
    expect(markup).toContain('inputMode="numeric"');
    expect(markup).toContain('pattern="[0-9]{6}"');
    expect(markup).toContain('resend');
  });
});
