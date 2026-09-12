import type { SourceRightsDecision } from '../retrieval/types';

/**
 * Facts produced by source, rights, and local parser/OCR stages before Hermes plans work.
 * User uploads are authorized for this preparation flow by the uploader's existing scope;
 * external-document rights apply only after a document has actually been acquired. A
 * bibliographic lead has no document bytes or download rights yet, so it can only request
 * the existing retrieval flow.
 */
export interface ResearchSourceReadinessInput {
  identityAuthorized: boolean;
  source: ResearchSourceAuthority;
  pages: readonly ResearchSourceReadinessPage[];
  localOcrAvailable: boolean;
}

export type ResearchSourceAuthority =
  | { kind: 'user_upload' }
  | { kind: 'external_document'; rights: SourceRightsDecision }
  | { kind: 'bibliographic_lead' };

export interface ResearchSourceReadinessPage {
  pageNumber: number;
  nativeText: 'available' | 'missing';
  localOcr: 'not_attempted' | 'high_confidence' | 'low_confidence';
}

export type ResearchSourceReadiness =
  | { status: 'ready'; reason: 'native_text_available' | 'local_ocr_text_available'; nextAction: 'use_native_text' | 'use_local_ocr_text' }
  | { status: 'needs_ocr'; reason: 'native_text_missing'; nextAction: 'run_local_ocr'; pageNumbers: number[] }
  | { status: 'needs_review'; reason: 'ocr_low_confidence' | 'local_ocr_unavailable' | 'document_text_unavailable'; nextAction: 'review_source'; pageNumbers?: number[] }
  | { status: 'retrieve'; reason: 'document_text_unavailable'; nextAction: 'retrieve_source' }
  | { status: 'blocked'; reason: 'identity_authorization_missing' | 'rights_not_permitted'; nextAction: 'request_authorization' | 'stop' };

function hasPermittedDocumentRights(rights: SourceRightsDecision): boolean {
  return rights.downloadPolicy === 'downloadable' || rights.downloadPolicy === 'authorized_user_only';
}

/**
 * Chooses the next bounded source-preparation step from already verified facts.
 * It does not retrieve documents, invoke OCR or a model, or establish scientific validity.
 */
export function decideResearchSourceReadiness(input: ResearchSourceReadinessInput): ResearchSourceReadiness {
  if (!input.identityAuthorized) {
    return { status: 'blocked', reason: 'identity_authorization_missing', nextAction: 'request_authorization' };
  }
  if (input.source.kind === 'external_document' && !hasPermittedDocumentRights(input.source.rights)) {
    return { status: 'blocked', reason: 'rights_not_permitted', nextAction: 'stop' };
  }
  if (input.source.kind === 'bibliographic_lead') {
    return { status: 'retrieve', reason: 'document_text_unavailable', nextAction: 'retrieve_source' };
  }

  const lowConfidencePages = input.pages
    .filter((page) => page.nativeText === 'missing' && page.localOcr === 'low_confidence')
    .map((page) => page.pageNumber);
  if (lowConfidencePages.length > 0) {
    return { status: 'needs_review', reason: 'ocr_low_confidence', nextAction: 'review_source', pageNumbers: lowConfidencePages };
  }

  const pagesNeedingOcr = input.pages
    .filter((page) => page.nativeText === 'missing' && page.localOcr === 'not_attempted')
    .map((page) => page.pageNumber);
  if (pagesNeedingOcr.length > 0) {
    if (input.localOcrAvailable) {
      return { status: 'needs_ocr', reason: 'native_text_missing', nextAction: 'run_local_ocr', pageNumbers: pagesNeedingOcr };
    }
    return { status: 'needs_review', reason: 'local_ocr_unavailable', nextAction: 'review_source', pageNumbers: pagesNeedingOcr };
  }

  if (input.pages.length > 0) {
    return input.pages.every((page) => page.nativeText === 'available')
      ? { status: 'ready', reason: 'native_text_available', nextAction: 'use_native_text' }
      : { status: 'ready', reason: 'local_ocr_text_available', nextAction: 'use_local_ocr_text' };
  }
  return { status: 'needs_review', reason: 'document_text_unavailable', nextAction: 'review_source' };
}
