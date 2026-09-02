export const EXTERNAL_SOURCE_PROVIDERS = ['semantic_scholar', 'tavily', 'scansci'] as const;
export type ExternalSourceProvider = typeof EXTERNAL_SOURCE_PROVIDERS[number];

export const SOURCE_RIGHTS_BASES = [
  'open_access',
  'institutional_access',
  'source_retrieval',
  'public_domain',
  'self_authored',
  'unknown',
  'prohibited',
] as const;
export type SourceRightsBasis = typeof SOURCE_RIGHTS_BASES[number];

export const SOURCE_DOWNLOAD_POLICIES = [
  'downloadable',
  'authorized_user_only',
  'source_link_only',
  'blocked',
] as const;
export type SourceDownloadPolicy = typeof SOURCE_DOWNLOAD_POLICIES[number];

export type SourceAccessEvidence =
  | { kind: 'open_access'; license?: string }
  | { kind: 'institutional_access'; entitlementVerified: boolean }
  | { kind: 'source_retrieval'; source: string }
  | { kind: 'public_domain' }
  | { kind: 'self_authored' }
  | { kind: 'unknown' }
  | { kind: 'prohibited' };

export interface SourceRightsDecision {
  basis: SourceRightsBasis;
  cacheAllowed: boolean;
  downloadPolicy: SourceDownloadPolicy;
  reasonCode:
    | 'open_license_verified'
    | 'open_license_missing'
    | 'institutional_entitlement_verified'
    | 'institutional_entitlement_missing'
    | 'source_retrieval_succeeded'
    | 'public_domain_verified'
    | 'self_authored_verified'
    | 'discovery_only'
    | 'rights_unknown'
    | 'source_prohibited';
  checkerVersion: 'openscience-rights-v1' | 'openscience-rights-v2';
}
