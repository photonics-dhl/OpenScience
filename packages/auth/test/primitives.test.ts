import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/password';
import {
  generateInvitationCode,
  generateSessionToken,
  generateVerificationCode,
  hashVerificationCode,
} from '../src/tokens';
import { invitationRejectReason } from '../src/invitations';
import {
  MAX_ATTEMPTS,
  inCooldown,
  isCodeExpired,
  isLocked,
  registerFailedAttempt,
} from '../src/verification';

describe('password', () => {
  it('hash/verify roundtrip', async () => {
    const hash = await hashPassword('passw0rd-example');
    expect(hash).not.toContain('passw0rd-example');
    expect(await verifyPassword(hash, 'passw0rd-example')).toBe(true);
    expect(await verifyPassword(hash, 'wrong-pass1')).toBe(false);
  });

  it('verify returns false for a corrupted hash instead of throwing', async () => {
    expect(await verifyPassword('not-a-real-hash', 'whatever1')).toBe(false);
  });
});

describe('tokens', () => {
  it('verification code is 6 digits', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateVerificationCode()).toMatch(/^\d{6}$/);
    }
  });

  it('hashVerificationCode matches sha256 of "123456"', () => {
    expect(hashVerificationCode('123456')).toBe(
      '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
    );
  });

  it('session token is 43-char base64url', () => {
    const t = generateSessionToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('invitation code is 20 chars from the unambiguous alphabet', () => {
    const c = generateInvitationCode();
    expect(c).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{20}$/);
  });
});

describe('invitationRejectReason', () => {
  const now = new Date('2026-07-28T12:00:00Z');
  const base = { usedBy: null, revokedAt: null, expiresAt: new Date('2026-08-01T00:00:00Z'), email: null };

  it('redeemable invitation returns null', () => {
    expect(invitationRejectReason(base, 'a@b.c', now)).toBeNull();
  });
  it('used invitation is rejected', () => {
    expect(invitationRejectReason({ ...base, usedBy: 'some-uuid' }, 'a@b.c', now)).toBe('USED');
  });
  it('revoked invitation is rejected', () => {
    expect(invitationRejectReason({ ...base, revokedAt: now }, 'a@b.c', now)).toBe('REVOKED');
  });
  it('expired invitation is rejected', () => {
    expect(invitationRejectReason({ ...base, expiresAt: now }, 'a@b.c', now)).toBe('EXPIRED');
  });
  it('email-bound invitation rejects a different email (case-insensitive)', () => {
    const bound = { ...base, email: 'Invited@Example.com' };
    expect(invitationRejectReason(bound, 'other@example.com', now)).toBe('EMAIL_MISMATCH');
    expect(invitationRejectReason(bound, 'invited@example.com', now)).toBeNull();
  });
});

describe('verification timing rules', () => {
  const now = new Date('2026-07-28T12:00:00Z');

  it('expiry is inclusive of the boundary instant', () => {
    expect(isCodeExpired(now, now)).toBe(true);
    expect(isCodeExpired(new Date(now.getTime() + 1), now)).toBe(false);
  });
  it('locked until is exclusive of the unlock instant', () => {
    expect(isLocked(new Date(now.getTime() + 1000), now)).toBe(true);
    expect(isLocked(now, now)).toBe(false);
    expect(isLocked(null, now)).toBe(false);
  });
  it('cooldown window is 60s', () => {
    expect(inCooldown(new Date(now.getTime() - 59_000), now)).toBe(true);
    expect(inCooldown(new Date(now.getTime() - 60_000), now)).toBe(false);
  });
  it('fifth failure locks for 15 minutes', () => {
    const fourth = registerFailedAttempt(MAX_ATTEMPTS - 2, now);
    expect(fourth).toEqual({ attempts: MAX_ATTEMPTS - 1, lockedUntil: null });
    const fifth = registerFailedAttempt(MAX_ATTEMPTS - 1, now);
    expect(fifth.attempts).toBe(MAX_ATTEMPTS);
    expect(fifth.lockedUntil?.getTime()).toBe(now.getTime() + 15 * 60 * 1000);
  });
});
