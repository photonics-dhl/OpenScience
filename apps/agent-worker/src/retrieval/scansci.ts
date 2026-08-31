import { createHash } from 'node:crypto';
import { externalHttpUrl, fetchWithTimeout, type RetrievalFetch } from './contracts';

const PROVIDER = 'scansci' as const;
const ALLOWED_ROUTES = new Set(['open_access', 'publisher_api', 'institutional']);
const MAX_PDF_BYTES = 100 * 1024 * 1024;
const IDENTIFIER = /^(?:10\.\d{4,9}\/[-._;()/:a-z0-9]+|(?:arxiv:)?\d{4}\.\d{4,5}(?:v\d+)?)$/i;

export type ScanSciAcquireResult =
  | {
    status: 'succeeded';
    provider: typeof PROVIDER;
    route: 'open_access' | 'publisher_api' | 'institutional';
    sourceUrl: string;
    bytes: Buffer;
    contentHash: string;
    mimeType: 'application/pdf';
    access: { kind: 'open_access'; license?: string } | { kind: 'institutional_access'; entitlementVerified: true };
    entitlementValidUntil?: Date;
  }
  | { status: 'unavailable'; provider: typeof PROVIDER; code: 'disabled' | 'auth_required' | 'not_found' | 'not_configured' | 'rate_limited' | 'timeout' | 'upstream_error' | 'invalid_response'; retryable: boolean }
  | { status: 'blocked'; provider: typeof PROVIDER; code: 'not_entitled' | 'route_not_allowed' | 'limit_exceeded'; retryable: false };

interface ScanSciConfig {
  enabled?: boolean;
  baseUrl?: string;
  serviceToken?: string;
  fetchImpl?: RetrievalFetch;
  timeoutMs?: number;
  maximumBytes?: number;
  now?: () => Date;
}

async function stableServiceFailure(response: Response): Promise<ScanSciAcquireResult> {
  let code: unknown;
  try {
    const body: unknown = await response.json();
    code = body && typeof body === 'object' && 'code' in body ? body.code : undefined;
  } catch {
    // The legal service promises a small JSON stable-code body. Treat any
    // malformed body as an upstream failure without retaining its contents.
  }
  switch (code) {
    case 'disabled': return { status: 'unavailable', provider: PROVIDER, code, retryable: false };
    case 'auth_required': return { status: 'unavailable', provider: PROVIDER, code, retryable: false };
    case 'not_entitled': return { status: 'blocked', provider: PROVIDER, code, retryable: false };
    case 'not_found': return { status: 'unavailable', provider: PROVIDER, code, retryable: false };
    case 'rate_limited': return { status: 'unavailable', provider: PROVIDER, code, retryable: true };
    case 'invalid_pdf': return { status: 'unavailable', provider: PROVIDER, code: 'invalid_response', retryable: false };
    case 'policy_blocked': return { status: 'blocked', provider: PROVIDER, code: 'route_not_allowed', retryable: false };
    case 'upstream_timeout': return { status: 'unavailable', provider: PROVIDER, code: 'timeout', retryable: true };
    case 'upstream_unavailable': return { status: 'unavailable', provider: PROVIDER, code: 'upstream_error', retryable: true };
    default: return { status: 'unavailable', provider: PROVIDER, code: 'upstream_error', retryable: response.status >= 500 };
  }
}

export function createScanSciAdapter(config: ScanSciConfig = {}) {
  const fetchImpl = config.fetchImpl ?? fetch;
  return {
    async acquire(input: { identifier: string; subjectId: string }): Promise<ScanSciAcquireResult> {
      if (config.enabled !== true) return { status: 'unavailable', provider: PROVIDER, code: 'disabled', retryable: false };
      if (!config.baseUrl || !config.serviceToken) return { status: 'unavailable', provider: PROVIDER, code: 'not_configured', retryable: false };
      const identifier = input.identifier.trim();
      if (!IDENTIFIER.test(identifier) || identifier.length > 300) throw new Error('ScanSci identifier is invalid');
      if (!/^[0-9a-f]{64}$/.test(input.subjectId)) throw new Error('ScanSci subject is invalid');
      let endpoint: URL;
      try {
        endpoint = new URL('/v1/legal-download', config.baseUrl);
      } catch {
        return { status: 'unavailable', provider: PROVIDER, code: 'not_configured', retryable: false };
      }
      let response: Response;
      try {
        response = await fetchWithTimeout(fetchImpl, endpoint.toString(), {
          method: 'POST',
          headers: {
            accept: 'application/pdf',
            'content-type': 'application/json',
            authorization: `Bearer ${config.serviceToken}`,
          },
          body: JSON.stringify({
            identifier,
            strategy: 'legal_only',
            scihub: false,
            tor: false,
            institutional: true,
            subject_id: input.subjectId,
          }),
        }, config.timeoutMs ?? 120_000);
      } catch (error) {
        return {
          status: 'unavailable', provider: PROVIDER,
          code: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'upstream_error',
          retryable: true,
        };
      }
      if (!response.ok) return stableServiceFailure(response);
      const route = response.headers.get('x-scansci-route');
      if (!route || !ALLOWED_ROUTES.has(route)) return { status: 'blocked', provider: PROVIDER, code: 'route_not_allowed', retryable: false };
      const maximumBytes = config.maximumBytes ?? MAX_PDF_BYTES;
      const declared = Number(response.headers.get('content-length') ?? 0);
      if ((declared && (!Number.isSafeInteger(declared) || declared > maximumBytes))) {
        return { status: 'blocked', provider: PROVIDER, code: 'limit_exceeded', retryable: false };
      }
      if (response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/pdf') {
        return { status: 'unavailable', provider: PROVIDER, code: 'invalid_response', retryable: false };
      }
      if (!response.body) return { status: 'unavailable', provider: PROVIDER, code: 'invalid_response', retryable: false };
      const reader = response.body.getReader();
      const chunks: Buffer[] = [];
      let total = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          total += chunk.value.byteLength;
          if (total > maximumBytes) {
            await reader.cancel().catch(() => undefined);
            return { status: 'blocked', provider: PROVIDER, code: 'limit_exceeded', retryable: false };
          }
          chunks.push(Buffer.from(chunk.value));
        }
      } catch {
        await reader.cancel().catch(() => undefined);
        return { status: 'unavailable', provider: PROVIDER, code: 'upstream_error', retryable: true };
      }
      const bytes = Buffer.concat(chunks, total);
      if (!bytes.length || !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
        return { status: 'unavailable', provider: PROVIDER, code: 'invalid_response', retryable: false };
      }
      const rawSourceUrl = response.headers.get('x-scansci-public-url');
      if (!rawSourceUrl) return { status: 'unavailable', provider: PROVIDER, code: 'invalid_response', retryable: false };
      let sourceUrl: string;
      try {
        sourceUrl = externalHttpUrl(rawSourceUrl);
      } catch {
        return { status: 'unavailable', provider: PROVIDER, code: 'invalid_response', retryable: false };
      }
      const license = response.headers.get('x-scansci-license')?.trim() || undefined;
      const entitlementValidUntil = route === 'institutional'
        ? new Date(response.headers.get('x-scansci-entitlement-valid-until') ?? '')
        : undefined;
      const access = route === 'institutional'
        ? response.headers.get('x-scansci-entitlement') === 'verified'
          && response.headers.get('x-scansci-entitlement-subject') === input.subjectId
          && entitlementValidUntil && Number.isFinite(entitlementValidUntil.getTime())
          && entitlementValidUntil.getTime() > (config.now?.() ?? new Date()).getTime()
          ? { kind: 'institutional_access' as const, entitlementVerified: true as const }
          : null
        : { kind: 'open_access' as const, ...(license ? { license } : {}) };
      if (!access) return { status: 'blocked', provider: PROVIDER, code: 'route_not_allowed', retryable: false };
      return {
        status: 'succeeded',
        provider: PROVIDER,
        route: route as 'open_access' | 'publisher_api' | 'institutional',
        sourceUrl,
        bytes,
        contentHash: createHash('sha256').update(bytes).digest('hex'),
        mimeType: 'application/pdf',
        access,
        ...(entitlementValidUntil ? { entitlementValidUntil } : {}),
      };
    },
  };
}
