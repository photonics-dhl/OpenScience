import { createHash } from 'node:crypto';
import type { FastifyReply } from 'fastify';
import type { StorageAdapter } from '@openscience/storage';
import { DETERMINISTIC_PRESENTATION_GENERATOR, DETERMINISTIC_PRESENTATION_GENERATOR_VERSION, PublicEvidenceSourceError } from '@openscience/domain';

const MAX_PRESENTATION_BYTES = 16 * 1024 * 1024;
const safeInlineImages = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);
const safeInlineVideos = new Set(['video/mp4', 'video/webm']);

function singleByteRange(range: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}

function isSafeDeterministicSvg(bytes: Buffer): boolean {
  const svg = bytes.toString('utf8');
  return svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')
    && !/(?:<script|<foreignobject|\son[a-z]+\s*=|\s(?:href|xlink:href)\s*=|url\s*\(|<!entity|<\?xml)/i.test(svg);
}
export async function sendPresentationAssetContent(
  storage: StorageAdapter,
  asset: { id: string; objectKey: string; contentHash: string; kind: string; generator: string; generatorVersion: string },
  reply: FastifyReply,
  visibility: 'public' | 'private',
  headers: { range?: string; 'if-range'?: string } = {},
) {
  let head;
  try {
    head = await storage.headObject(asset.objectKey);
  } catch (error) {
    throw new PublicEvidenceSourceError('SOURCE_UNAVAILABLE', 'presentation asset is temporarily unavailable', { cause: error });
  }
  if (!head) throw new PublicEvidenceSourceError('SOURCE_UNAVAILABLE', 'presentation asset is temporarily unavailable');
  if (head.size < 1 || head.size > MAX_PRESENTATION_BYTES) {
    throw new PublicEvidenceSourceError('NOT_FOUND', 'presentation asset not found');
  }
  let object;
  try {
    object = await storage.getObject(asset.objectKey);
  } catch (error) {
    throw new PublicEvidenceSourceError('SOURCE_UNAVAILABLE', 'presentation asset is temporarily unavailable', { cause: error });
  }
  if (object.size !== head.size || object.size > MAX_PRESENTATION_BYTES) {
    object.body.destroy();
    throw new PublicEvidenceSourceError('NOT_FOUND', 'presentation asset not found');
  }
  const chunks: Buffer[] = [];
  const digest = createHash('sha256');
  let received = 0;
  try {
    for await (const value of object.body) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      received += chunk.length;
      if (received > object.size || received > MAX_PRESENTATION_BYTES) {
        object.body.destroy();
        throw new PublicEvidenceSourceError('NOT_FOUND', 'presentation asset not found');
      }
      digest.update(chunk);
      chunks.push(chunk);
    }
  } catch (error) {
    if (error instanceof PublicEvidenceSourceError) throw error;
    throw new PublicEvidenceSourceError('SOURCE_UNAVAILABLE', 'presentation asset is temporarily unavailable', { cause: error });
  }
  if (received !== object.size || digest.digest('hex') !== asset.contentHash.toLowerCase()) {
    throw new PublicEvidenceSourceError('NOT_FOUND', 'presentation asset not found');
  }

  const bytes = Buffer.concat(chunks);
  const storedType = (object.contentType ?? head.contentType ?? '').toLowerCase().split(';', 1)[0] ?? '';
  const deterministicChartSvg = asset.kind === 'chart' && storedType === 'image/svg+xml'
    && asset.generator === DETERMINISTIC_PRESENTATION_GENERATOR
    && [DETERMINISTIC_PRESENTATION_GENERATOR_VERSION, 'openscience-presentation-v1'].includes(asset.generatorVersion)
    && isSafeDeterministicSvg(bytes);
  const inline = ((asset.kind === 'image' || asset.kind === 'chart') && safeInlineImages.has(storedType))
    || deterministicChartSvg || (asset.kind === 'video' && safeInlineVideos.has(storedType));
  const contentType = inline ? storedType : 'application/octet-stream';
  reply
    .header('Content-Type', contentType)
    .header('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="presentation-${asset.id}"`)
    .header('X-Content-Type-Options', 'nosniff')
    .header('Content-Security-Policy', "sandbox; default-src 'none'")
    .header('Cache-Control', visibility === 'private' ? 'private, no-store' : 'public, max-age=31536000, immutable')
    .header('Referrer-Policy', 'no-referrer');

  // Authenticate and verify the complete stored object before exposing lengths or slices.
  if (asset.kind === 'video' && safeInlineVideos.has(storedType)) {
    const etag = `"${asset.contentHash.toLowerCase()}"`;
    reply.header('Accept-Ranges', 'bytes').header('ETag', etag);
    if (headers.range !== undefined && (headers['if-range'] === undefined || headers['if-range'] === etag)) {
      const range = singleByteRange(headers.range, received);
      if (!range) {
        return reply.status(416).header('Content-Range', `bytes */${received}`)
          .header('Content-Length', '0').send(Buffer.alloc(0));
      }
      return reply.status(206).header('Content-Range', `bytes ${range.start}-${range.end}/${received}`)
        .header('Content-Length', String(range.end - range.start + 1))
        .send(bytes.subarray(range.start, range.end + 1));
    }
  } else if (headers.range !== undefined && visibility === 'private') {
    return reply.status(416).type('application/json').send({ error: {
      code: 'RANGE_NOT_SUPPORTED', message: 'Partial presentation reads are not supported',
    } });
  }
  return reply.header('Content-Length', String(received)).send(bytes);
}
