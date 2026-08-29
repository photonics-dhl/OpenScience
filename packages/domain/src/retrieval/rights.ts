import type {
  ExternalSourceProvider,
  SourceAccessEvidence,
  SourceRightsDecision,
} from './types';

const REDISTRIBUTABLE_LICENSES = new Set([
  'CC0',
  'CC0-1.0',
  'CC-BY',
  'CC-BY-3.0',
  'CC-BY-4.0',
  'CC-BY-SA',
  'CC-BY-SA-3.0',
  'CC-BY-SA-4.0',
  'PUBLIC-DOMAIN',
]);

function validateSourceUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('sourceUrl is invalid');
  }
  if (url.protocol !== 'https:') throw new Error('sourceUrl is invalid');
}

function decision(
  basis: SourceRightsDecision['basis'],
  cacheAllowed: boolean,
  downloadPolicy: SourceRightsDecision['downloadPolicy'],
  reasonCode: SourceRightsDecision['reasonCode'],
): SourceRightsDecision {
  return { basis, cacheAllowed, downloadPolicy, reasonCode, checkerVersion: 'openscience-rights-v1' };
}

export function decideSourceRights(input: {
  provider: ExternalSourceProvider;
  sourceUrl: string;
  access: SourceAccessEvidence;
}): SourceRightsDecision {
  validateSourceUrl(input.sourceUrl);
  if (input.access.kind === 'prohibited') {
    return decision('prohibited', false, 'blocked', 'source_prohibited');
  }
  if (input.provider === 'tavily') {
    return decision('unknown', false, 'source_link_only', 'discovery_only');
  }
  switch (input.access.kind) {
    case 'open_access': {
      const license = input.access.license?.trim().toUpperCase();
      return license && REDISTRIBUTABLE_LICENSES.has(license)
        ? decision('open_access', true, 'downloadable', 'open_license_verified')
        : decision('open_access', false, 'source_link_only', 'open_license_missing');
    }
    case 'institutional_access':
      return input.access.entitlementVerified
        ? decision('institutional_access', true, 'authorized_user_only', 'institutional_entitlement_verified')
        : decision('institutional_access', false, 'source_link_only', 'institutional_entitlement_missing');
    case 'public_domain':
      return decision('public_domain', true, 'downloadable', 'public_domain_verified');
    case 'self_authored':
      return decision('self_authored', true, 'downloadable', 'self_authored_verified');
    case 'unknown':
      return decision('unknown', false, 'source_link_only', 'rights_unknown');
  }
}
