import { describe, expect, it } from 'vitest';
import {
  decideResearchSourceReadiness,
  type ResearchSourceReadinessInput,
} from '../../src/agent/research-source-readiness';

const downloadableRights = {
  basis: 'open_access' as const,
  cacheAllowed: true,
  downloadPolicy: 'downloadable' as const,
  reasonCode: 'open_license_verified',
  checkerVersion: 'openscience-rights-v1',
};

function input(overrides: Partial<ResearchSourceReadinessInput> = {}): ResearchSourceReadinessInput {
  return {
    identityAuthorized: true,
    source: { kind: 'user_upload' },
    pages: [{ pageNumber: 1, nativeText: 'available', localOcr: 'not_attempted' }],
    localOcrAvailable: true,
    ...overrides,
  };
}

describe('research source readiness', () => {
  it('uses an authorized native source without retrieval or OCR', () => {
    expect(decideResearchSourceReadiness(input())).toEqual({
      status: 'ready', reason: 'native_text_available', nextAction: 'use_native_text',
    });
  });

  it('uses a permitted external document without making it retrieve or OCR again', () => {
    expect(decideResearchSourceReadiness(input({
      source: { kind: 'external_document', rights: downloadableRights },
    }))).toEqual({
      status: 'ready', reason: 'native_text_available', nextAction: 'use_native_text',
    });
  });

  it('prefers available native text over a historical low-confidence OCR result', () => {
    expect(decideResearchSourceReadiness(input({
      pages: [{ pageNumber: 1, nativeText: 'available', localOcr: 'low_confidence' }],
    }))).toEqual({
      status: 'ready', reason: 'native_text_available', nextAction: 'use_native_text',
    });
  });

  it('limits local OCR to only pages whose native text is unavailable', () => {
    expect(decideResearchSourceReadiness(input({
      pages: [
        { pageNumber: 1, nativeText: 'available', localOcr: 'not_attempted' },
        { pageNumber: 2, nativeText: 'missing', localOcr: 'not_attempted' },
        { pageNumber: 3, nativeText: 'missing', localOcr: 'high_confidence' },
      ],
    }))).toEqual({
      status: 'needs_ocr', reason: 'native_text_missing', nextAction: 'run_local_ocr', pageNumbers: [2],
    });
  });

  it('sends low-confidence OCR to human review instead of retrying it', () => {
    expect(decideResearchSourceReadiness(input({
      pages: [{ pageNumber: 5, nativeText: 'missing', localOcr: 'low_confidence' }],
    }))).toEqual({
      status: 'needs_review', reason: 'ocr_low_confidence', nextAction: 'review_source', pageNumbers: [5],
    });
  });

  it('requests existing retrieval when no document text exists but a bibliographic lead does', () => {
    expect(decideResearchSourceReadiness(input({
      source: { kind: 'bibliographic_lead' }, pages: [], localOcrAvailable: false,
    }))).toEqual({
      status: 'retrieve', reason: 'document_text_unavailable', nextAction: 'retrieve_source',
    });
  });

  it('blocks unpermitted rights and missing identity authorization before any source action', () => {
    expect(decideResearchSourceReadiness(input({ identityAuthorized: false }))).toEqual({
      status: 'blocked', reason: 'identity_authorization_missing', nextAction: 'request_authorization',
    });
    expect(decideResearchSourceReadiness(input({
      source: { kind: 'external_document', rights: { ...downloadableRights, downloadPolicy: 'source_link_only', cacheAllowed: false } },
      pages: [],
    }))).toEqual({
      status: 'blocked', reason: 'rights_not_permitted', nextAction: 'stop',
    });
  });

  it('uses review when local OCR is unavailable instead of selecting LLM OCR', () => {
    expect(decideResearchSourceReadiness(input({
      pages: [{ pageNumber: 7, nativeText: 'missing', localOcr: 'not_attempted' }],
      localOcrAvailable: false,
    }))).toEqual({
      status: 'needs_review', reason: 'local_ocr_unavailable', nextAction: 'review_source', pageNumbers: [7],
    });
  });
});
