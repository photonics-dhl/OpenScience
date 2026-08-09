import { ApiClientError, apiRequest } from './api';

export interface CurrentUser {
  userId: string;
  email: string;
  displayName: string;
  status: string;
  level: string;
}

export function safeNextPath(value: string | null | undefined, fallback = '/dashboard'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}

const AUTH_ERROR_KEYS: Record<string, string> = {
  INVITATION_INVALID: 'errors.invitationInvalid',
  INVITATION_EMAIL_MISMATCH: 'errors.invitationEmailMismatch',
  ACCOUNT_NOT_ACTIVE: 'errors.accountNotActive',
  INVALID_CREDENTIALS: 'errors.invalidCredentials',
  CODE_INVALID: 'errors.codeInvalid',
  CODE_EXPIRED: 'errors.codeExpired',
  RATE_LIMITED: 'errors.rateLimited',
  VERIFICATION_DELIVERY_FAILED: 'errors.verificationDeliveryFailed',
};

export function authErrorKey(code: string): string {
  return AUTH_ERROR_KEYS[code] ?? 'errors.unknown';
}

export function authErrorCode(error: unknown): string {
  return error instanceof ApiClientError ? error.code : 'UNKNOWN';
}

export function registerAccount(input: {
  invitationCode: string;
  email: string;
  password: string;
  displayName: string;
}) {
  return apiRequest<{ userId: string; status: string }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function requestSignupCode(input: { email: string; displayName: string }) {
  return apiRequest<{ ok: boolean }>('/api/auth/request-signup-code', {
    method: 'POST', body: JSON.stringify(input),
  });
}

export function confirmSignup(input: { email: string; displayName: string; code: string; password: string }) {
  return apiRequest<{ userId: string; status: string }>('/api/auth/confirm-signup', {
    method: 'POST', body: JSON.stringify(input),
  });
}

export function verifyAccount(input: { email: string; code: string }) {
  return apiRequest<{ userId: string; status: string }>('/api/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function resendVerification(email: string) {
  return apiRequest<{ ok: boolean }>('/api/auth/resend-code', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function loginAccount(input: { email: string; password: string }) {
  return apiRequest<{ userId: string; status: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function logoutAccount() {
  return apiRequest<void>('/api/auth/logout', { method: 'POST' });
}

export function getCurrentUser() {
  return apiRequest<CurrentUser>('/api/auth/me');
}
