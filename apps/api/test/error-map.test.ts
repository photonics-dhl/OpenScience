import { describe, expect, it } from 'vitest';
import { AuthError } from '@openscience/auth';
import { httpStatusForError } from '../src/error-map';

describe('httpStatusForError', () => {
  it('maps auth error codes to HTTP status', () => {
    expect(httpStatusForError(new AuthError('INVITATION_INVALID', 'x')).status).toBe(400);
    expect(httpStatusForError(new AuthError('EMAIL_ALREADY_REGISTERED', 'x')).status).toBe(409);
    expect(httpStatusForError(new AuthError('CODE_EXPIRED', 'x')).status).toBe(410);
    expect(httpStatusForError(new AuthError('CODE_LOCKED', 'x')).status).toBe(429);
    expect(httpStatusForError(new AuthError('CREDENTIALS_INVALID', 'x')).status).toBe(401);
    expect(httpStatusForError(new AuthError('ACCOUNT_NOT_ACTIVE', 'x')).status).toBe(403);
  });

  it('keeps the unified error body shape', () => {
    const { body } = httpStatusForError(new AuthError('CODE_INVALID', '验证码错误或已失效'), 'req-9');
    expect(body).toEqual({ error: { code: 'CODE_INVALID', message: '验证码错误或已失效', requestId: 'req-9' } });
  });

  it('maps ZodError-shaped errors to 400 VALIDATION_ERROR', () => {
    const err = new Error('bad');
    err.name = 'ZodError';
    expect(httpStatusForError(err)).toEqual({
      status: 400,
      body: { error: { code: 'VALIDATION_ERROR', message: '请求参数不合法' } },
    });
  });

  it('unknown errors become 500 without leaking internals', () => {
    const { status, body } = httpStatusForError(new Error('db connection string leaked here'));
    expect(status).toBe(500);
    expect(body.error.message).not.toContain('db connection');
  });
});
