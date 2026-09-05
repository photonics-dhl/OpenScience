import { createHash } from 'node:crypto';
import type { FastifyReply } from 'fastify';
import type { StorageAdapter } from '@openscience/storage';
import { DETERMINISTIC_PRESENTATION_GENERATOR, DETERMINISTIC_PRESENTATION_GENERATOR_VERSION, PublicEvidenceSourceError } from '@openscience/domain';

const MAX_PRESENTATION_BYTES = 16 * 1024 * 1024;
const safeInlineImages = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);
const safeInlineVideos = new Set(['video/mp4', 'video/webm']);

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
  return reply
    .header('Content-Type', contentType)
    .header('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="presentation-${asset.id}"`)
    .header('Content-Length', String(received))
    .header('X-Content-Type-Options', 'nosniff')
    .header('Content-Security-Policy', "sandbox; default-src 'none'")
    .header('Cache-Control', visibility === 'private' ? 'private, no-store' : 'public, max-age=31536000, immutable')
    .header('Referrer-Policy', 'no-referrer')
    .send(bytes);
}
