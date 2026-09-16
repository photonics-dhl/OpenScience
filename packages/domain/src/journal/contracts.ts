export type JournalErrorCode =
  | 'APPLICATION_NOT_FOUND'
  | 'JOURNAL_NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_STATE'
  | 'VALIDATION_ERROR'
  | 'REVISION_CONFLICT'
  | 'ISSN_CONFLICT'
  | 'SLUG_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'LAST_OWNER'
  | 'INSUFFICIENT_CREDITS'
  | 'CONCURRENT_CONFLICT';

const ERROR_STATUS: Record<JournalErrorCode, number> = {
  APPLICATION_NOT_FOUND: 404,
  JOURNAL_NOT_FOUND: 404,
  FORBIDDEN: 403,
  INVALID_STATE: 409,
  VALIDATION_ERROR: 400,
  REVISION_CONFLICT: 409,
  ISSN_CONFLICT: 409,
  SLUG_CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  LAST_OWNER: 409,
  INSUFFICIENT_CREDITS: 409,
  CONCURRENT_CONFLICT: 409,
};

export class JournalError extends Error {
  readonly status: number;

  constructor(readonly code: JournalErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = new.target.name;
    this.status = ERROR_STATUS[code];
  }
}

export type JournalRole = 'owner' | 'admin' | 'editor' | 'reviewer';
export type WorkspaceJournalRole = 'owner' | 'maintainer' | 'author' | 'reviewer';
export type JournalApplicationState = 'draft' | 'submitted' | 'needs_information' | 'approved' | 'rejected';
export type JournalOperationalState = 'active' | 'paused' | 'closed' | 'reverification';

export const JOURNAL_TO_WORKSPACE_ROLE: Record<JournalRole, WorkspaceJournalRole> = {
  owner: 'owner',
  admin: 'maintainer',
  editor: 'author',
  reviewer: 'reviewer',
};

export interface JournalApplicationDraftInput {
  applicationId?: string;
  revision?: number;
  nameZh?: string;
  nameEn?: string;
  pIssn?: string;
  eIssn?: string;
  websiteUrl?: string;
  publisherName?: string;
  sponsorName?: string;
  subjects?: string[];
  description?: string;
  logoUrl?: string;
  applicantName?: string;
  applicantTitle?: string;
  applicantEmail?: string;
  representationEvidence?: string;
  plannedArticleCount?: number;
  requestedServices?: string[];
  rightsDeclaration?: string;
  rightsDeclarationVersion?: string;
}

export interface JournalApplicationView {
  id: string;
  applicantId: string;
  status: JournalApplicationState;
  revision: number;
  submittedAt: Date | null;
  journalId: string | null;
  createdAt: Date;
  updatedAt: Date;
  reviewReason: string | null;
  nameZh: string | null;
  nameEn: string | null;
  pIssn: string | null;
  eIssn: string | null;
  websiteUrl: string | null;
  publisherName: string | null;
  sponsorName: string | null;
  subjects: string[];
  description: string | null;
  logoUrl: string | null;
  applicantName: string | null;
  applicantTitle: string | null;
  applicantEmail: string | null;
  representationEvidence: string | null;
  plannedArticleCount: number | null;
  requestedServices: string[];
  rightsDeclaration: string | null;
  rightsDeclarationVersion: string | null;
}

export interface JournalPublicDetail {
  id: string;
  slug: string;
  nameZh: string | null;
  nameEn: string | null;
  pIssn: string | null;
  eIssn: string | null;
  websiteUrl: string;
  publisherName: string;
  sponsorName: string | null;
  subjects: string[];
  description: string | null;
  logoUrl: string | null;
  operationalState: JournalOperationalState;
  verifiedAt: Date;
}
