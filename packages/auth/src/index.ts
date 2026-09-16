export { AuthError, type AuthErrorCode } from './errors';
export { hashPassword, verifyPassword } from './password';
export {
  generateInvitationCode,
  generateSessionToken,
  generateVerificationCode,
  hashVerificationCode,
} from './tokens';
export { assertInvitationRedeemable, invitationRejectReason, type InvitationRejectReason } from './invitations';
export {
  CODE_TTL_MS,
  LOCK_MS,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  inCooldown,
  isCodeExpired,
  isLocked,
  registerFailedAttempt,
} from './verification';
export {
  SESSION_TTL_SECONDS,
  createSession,
  destroySession,
  resolveSession,
  type SessionData,
} from './session';
export { DevOutboxMailer, SmtpMailer, type Mailer, type MailMessage, type SmtpConfig } from './mailer';
export {
  beginOrcidConnection,
  completeOrcidConnection,
  getAcademicIdentityStatus,
  resolveInstitutionDomain,
  requestInstitutionEmailCode,
  verifyInstitutionEmail,
  type AcademicIdentityDeps,
  type AcademicIdentityStatus,
  type InstitutionMatch,
  type OrcidConfig,
} from './academic-identity';
export {
  getCurrentUser,
  login,
  logout,
  register,
  requestSignupCode,
  confirmSignup,
  resendCode,
  verifyEmail,
  type AuthDeps,
  type AuthResult,
  type CurrentUser,
  type RegisterInput,
  type SignupCodeRequest,
  type SignupConfirmation,
  type SignupTransactionHook,
} from './auth-service';
