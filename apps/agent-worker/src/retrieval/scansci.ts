import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath, unlink } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { externalHttpUrl } from './contracts';
import { downloadThroughScanSciMcp, type ScanSciMcpDownload } from './scansci-mcp';

const PROVIDER = 'scansci' as const;
const MAX_PDF_BYTES = 100 * 1024 * 1024;
const IDENTIFIER = /^(?:10\.\d{4,9}\/[-._;()/:a-z0-9]+|(?:arxiv:)?\d{4}\.\d{4,5}(?:v\d+)?)$/i;

export type ScanSciAcquireResult =
  | {
    status: 'succeeded';
    provider: typeof PROVIDER;
    route: 'open_access' | 'source_retrieval';
    source: string;
    sourceUrl: string;
    providerVersion: string;
    bytes: Buffer;
    contentHash: string;
    mimeType: 'application/pdf';
    access: { kind: 'open_access'; license: string } | { kind: 'source_retrieval'; source: string };
    acknowledge: () => Promise<void>;
    discard: () => Promise<void>;
    entitlementValidUntil?: Date;
  }
  | { status: 'unavailable'; provider: typeof PROVIDER; code: 'disabled' | 'auth_required' | 'not_found' | 'not_configured' | 'rate_limited' | 'timeout' | 'upstream_error' | 'invalid_response'; retryable: boolean }
  | { status: 'blocked'; provider: typeof PROVIDER; code: 'limit_exceeded'; retryable: false };

interface ScanSciConfig {
  enabled?: boolean;
  mcpUrl?: string;
  papersDir?: string;
  timeoutMs?: number;
  maximumBytes?: number;
}

function boundedString(value: unknown, maximum: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  const hasControlCharacter = [...normalized].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
  return normalized && normalized.length <= maximum && !hasControlCharacter
    ? normalized
    : undefined;
}

function mapFailure(result: ScanSciMcpDownload): ScanSciAcquireResult {
  const errorType = boundedString(result.error_type, 100)?.toLowerCase() ?? '';
  const action = boundedString(result.action, 100)?.toLowerCase() ?? '';
  const error = boundedString(result.error, 500)?.toLowerCase() ?? '';
  const combined = `${errorType} ${action} ${error}`;
  if (errorType === 'paywall' || action === 'login_required' || /\b(?:login|auth)(?:entication)?[_ -]?required\b/.test(combined)) {
    return { status: 'unavailable', provider: PROVIDER, code: 'auth_required', retryable: false };
  }
  if (result.status_code === 429 || /rate[_ -]?limit|too many requests/.test(combined)) {
    return { status: 'unavailable', provider: PROVIDER, code: 'rate_limited', retryable: true };
  }
  if (/timeout|timed out/.test(combined)) {
    return { status: 'unavailable', provider: PROVIDER, code: 'timeout', retryable: true };
  }
  if (result.status_code === 404 || /not[_ -]?found/.test(combined)) {
    return { status: 'unavailable', provider: PROVIDER, code: 'not_found', retryable: false };
  }
  return { status: 'unavailable', provider: PROVIDER, code: 'upstream_error', retryable: true };
}

function identifierLandingUrl(identifier: string): string {
  if (identifier.toLowerCase().startsWith('10.')) {
    return externalHttpUrl(`https://doi.org/${identifier}`);
  }
  return externalHttpUrl(`https://arxiv.org/abs/${identifier.replace(/^arxiv:/i, '')}`);
}

function sourceUrl(result: ScanSciMcpDownload, identifier: string): string {
  const candidate = boundedString(result.url, 2_048) ?? boundedString(result.source_url, 2_048);
  if (candidate) {
    try {
      return externalHttpUrl(candidate);
    } catch {
      // A source may expose a direct HTTP or credential-bearing URL. Keep the
      // source label, but publish the stable DOI/arXiv landing page instead.
    }
  }
  return identifierLandingUrl(identifier);
}

async function readBoundedPdf(root: string, candidate: string, maximumBytes: number): Promise<{
  bytes: Buffer;
  cleanup: () => Promise<void>;
}> {
  const rootPath = await realpath(root);
  const targetPath = resolve(isAbsolute(candidate) ? candidate : resolve(rootPath, candidate));
  const fromRoot = relative(rootPath, targetPath);
  if (fromRoot === '..' || fromRoot.startsWith('../') || fromRoot.startsWith('..\\') || isAbsolute(fromRoot)) {
    throw new Error('ScanSci PDF path is outside its volume');
  }
  const before = await lstat(targetPath);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) {
    throw new Error('ScanSci PDF is not a regular file');
  }
  if (resolve(await realpath(targetPath)) !== targetPath) {
    throw new Error('ScanSci PDF path traverses a symlink');
  }
  if (before.size < 5 || before.size > maximumBytes) {
    const error = new Error('ScanSci PDF size is invalid');
    error.name = 'ScanSciLimitError';
    throw error;
  }
  const noFollow = (constants as unknown as Record<string, number>).O_NOFOLLOW ?? 0;
  const handle = await open(targetPath, constants.O_RDONLY | noFollow);
  let bytes: Buffer;
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) {
      throw new Error('ScanSci PDF changed before open');
    }
    bytes = await handle.readFile();
    const after = await handle.stat();
    if (after.size !== opened.size || bytes.byteLength !== opened.size || bytes.byteLength > maximumBytes) {
      throw new Error('ScanSci PDF changed while reading');
    }
    if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new Error('ScanSci result is not a PDF');
    }
  } finally {
    await handle.close();
  }
  let cleanedUp = false;
  return {
    bytes,
    cleanup: async () => {
      if (cleanedUp) return;
      const beforeDelete = await lstat(targetPath);
      if (beforeDelete.dev !== before.dev || beforeDelete.ino !== before.ino
        || !beforeDelete.isFile() || beforeDelete.isSymbolicLink()
        || resolve(await realpath(targetPath)) !== targetPath) {
        throw new Error('ScanSci PDF changed before cleanup');
      }
      await unlink(targetPath);
      cleanedUp = true;
    },
  };
}

export function createScanSciAdapter(config: ScanSciConfig = {}) {
  return {
    async acquire(input: { identifier: string; subjectId: string }): Promise<ScanSciAcquireResult> {
      if (config.enabled !== true) {
        return { status: 'unavailable', provider: PROVIDER, code: 'disabled', retryable: false };
      }
      if (!config.mcpUrl || !config.papersDir) {
        return { status: 'unavailable', provider: PROVIDER, code: 'not_configured', retryable: false };
      }
      const identifier = input.identifier.trim();
      if (!IDENTIFIER.test(identifier) || identifier.length > 300) throw new Error('ScanSci identifier is invalid');
      if (!/^[0-9a-f]{64}$/.test(input.subjectId)) throw new Error('ScanSci subject is invalid');
      let result: ScanSciMcpDownload;
      let providerVersion: string;
      try {
        const response = await downloadThroughScanSciMcp({
          mcpUrl: config.mcpUrl,
          identifier,
          outputDir: config.papersDir,
          timeoutMs: config.timeoutMs ?? 360_000,
        });
        result = response.download;
        providerVersion = response.providerVersion;
      } catch (error) {
        const detail = error instanceof Error ? `${error.name} ${error.message}`.toLowerCase() : '';
        return {
          status: 'unavailable',
          provider: PROVIDER,
          code: /abort|timeout|timed out|requesttimeout/.test(detail) ? 'timeout' : 'upstream_error',
          retryable: true,
        };
      }
      if (result.success !== true) return mapFailure(result);
      const file = boundedString(result.file, 4_096);
      const source = boundedString(result.source, 200);
      if (!file || !source) {
        return { status: 'unavailable', provider: PROVIDER, code: 'invalid_response', retryable: false };
      }
      let staged: Awaited<ReturnType<typeof readBoundedPdf>>;
      try {
        staged = await readBoundedPdf(config.papersDir, file, config.maximumBytes ?? MAX_PDF_BYTES);
      } catch (error) {
        if (error instanceof Error && error.name === 'ScanSciLimitError') {
          return { status: 'blocked', provider: PROVIDER, code: 'limit_exceeded', retryable: false };
        }
        return { status: 'unavailable', provider: PROVIDER, code: 'invalid_response', retryable: false };
      }
      const license = boundedString(result.license, 200);
      return {
        status: 'succeeded',
        provider: PROVIDER,
        route: license ? 'open_access' : 'source_retrieval',
        source,
        sourceUrl: sourceUrl(result, identifier),
        providerVersion,
        bytes: staged.bytes,
        contentHash: createHash('sha256').update(staged.bytes).digest('hex'),
        mimeType: 'application/pdf',
        access: license
          ? { kind: 'open_access', license }
          : { kind: 'source_retrieval', source },
        acknowledge: staged.cleanup,
        discard: staged.cleanup,
      };
    },
  };
}
