export type AuthErrorCode =
  | 'INVITATION_INVALID'
  | 'EMAIL_ALREADY_REGISTERED'
  | 'CODE_INVALID'
  | 'CODE_EXPIRED'
  | 'CODE_LOCKED'
  | 'RESEND_COOLDOWN'
  | 'CREDENTIALS_INVALID'
  | 'ACCOUNT_NOT_ACTIVE'
  | 'VERIFICATION_DELIVERY_FAILED'
  | 'ORCID_NOT_CONFIGURED'
  | 'ORCID_AUTHORIZATION_FAILED'
  | 'CREDENTIAL_ALREADY_LINKED'
  | 'INSTITUTION_DOMAIN_NOT_ALLOWED'
  | 'SESSION_INVALID';

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
