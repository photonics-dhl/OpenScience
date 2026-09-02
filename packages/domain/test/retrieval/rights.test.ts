import { describe, expect, it } from 'vitest';
import { decideSourceRights } from '../../src/retrieval/rights';

describe('source rights decision', () => {
  it('allows a recognized open license to be cached and downloaded', () => {
    expect(decideSourceRights({
      provider: 'semantic_scholar',
      sourceUrl: 'https://example.org/paper.pdf',
      access: { kind: 'open_access', license: 'CC-BY-4.0' },
    })).toMatchObject({
      basis: 'open_access',
      cacheAllowed: true,
      downloadPolicy: 'downloadable',
      reasonCode: 'open_license_verified',
    });
  });

  it('keeps an OA link with no license as link-only', () => {
    expect(decideSourceRights({
      provider: 'semantic_scholar',
      sourceUrl: 'https://example.org/paper',
      access: { kind: 'open_access' },
    })).toMatchObject({
      cacheAllowed: false,
      downloadPolicy: 'source_link_only',
      reasonCode: 'open_license_missing',
    });
  });

  it('limits institution-entitled bytes to the requesting authorized user', () => {
    expect(decideSourceRights({
      provider: 'scansci',
      sourceUrl: 'https://publisher.example/paper',
      access: { kind: 'institutional_access', entitlementVerified: true },
    })).toMatchObject({
      basis: 'institutional_access',
      cacheAllowed: true,
      downloadPolicy: 'authorized_user_only',
      reasonCode: 'institutional_entitlement_verified',
    });
  });

  it('stores a successful ScanSci source retrieval without relabelling its provenance', () => {
    expect(decideSourceRights({
      provider: 'scansci',
      sourceUrl: 'https://sci-hub.vg/10.1000/example',
      access: { kind: 'source_retrieval', source: 'sci-hub.vg' } as never,
    })).toEqual({
      basis: 'source_retrieval',
      cacheAllowed: true,
      downloadPolicy: 'downloadable',
      reasonCode: 'source_retrieval_succeeded',
      checkerVersion: 'openscience-rights-v2',
    });
  });

  it('never treats Tavily discovery as document authority', () => {
    expect(decideSourceRights({
      provider: 'tavily',
      sourceUrl: 'https://example.org/result',
      access: { kind: 'unknown' },
    })).toMatchObject({
      basis: 'unknown',
      cacheAllowed: false,
      downloadPolicy: 'source_link_only',
      reasonCode: 'discovery_only',
    });
  });

  it('blocks prohibited sources even if another access hint is present', () => {
    expect(decideSourceRights({
      provider: 'scansci',
      sourceUrl: 'https://example.org/blocked',
      access: { kind: 'prohibited' },
    })).toMatchObject({
      basis: 'prohibited',
      cacheAllowed: false,
      downloadPolicy: 'blocked',
      reasonCode: 'source_prohibited',
    });
  });
});
