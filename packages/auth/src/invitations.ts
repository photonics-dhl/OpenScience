import type { Invitation } from '@prisma/client';
import { AuthError } from './errors';

export type InvitationRejectReason = 'USED' | 'REVOKED' | 'EXPIRED' | 'EMAIL_MISMATCH';

const REASON_MESSAGES: Record<InvitationRejectReason, string> = {
  USED: '邀请码已被使用',
  REVOKED: '邀请码已被吊销',
  EXPIRED: '邀请码已过期',
  EMAIL_MISMATCH: '邀请码与邮箱不匹配',
};

type Redeemable = Pick<Invitation, 'usedBy' | 'revokedAt' | 'expiresAt' | 'email'>;

export function invitationRejectReason(inv: Redeemable, email: string, now: Date): InvitationRejectReason | null {
  if (inv.usedBy) return 'USED';
  if (inv.revokedAt) return 'REVOKED';
  if (inv.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  if (inv.email && inv.email.toLowerCase() !== email.toLowerCase()) return 'EMAIL_MISMATCH';
  return null;
}

/** 不可核销时抛 AuthError('INVITATION_INVALID')。调用方需先自行处理 inv 为 null 的情况。 */
export function assertInvitationRedeemable(inv: Redeemable, email: string, now: Date): void {
  const reason = invitationRejectReason(inv, email, now);
  if (reason) throw new AuthError('INVITATION_INVALID', REASON_MESSAGES[reason]);
}
