import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { get, type RequestOptions } from 'node:https';
import { BlockList, isIP, type TcpSocketConnectOpts } from 'node:net';
import { MiniMaxVideoError, validateMiniMaxVideoTask, type MiniMaxVideoTask } from './minimax-video.js';

export const MINIMAX_VIDEO_MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024;
const MAX_TIMEOUT_MS = 90_000;
const CONTAINER_BOXES = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf', 'mvex', 'moof', 'traf', 'mfra']);

/** Check complete ISO-BMFF box boundaries, not codec or scientific/visual quality.
 * This prevents a truncated HTTP-success body becoming a reusable original.
 * Full decoding remains required before using the movie in a product. */
export function validateMiniMaxVideoBytes(bytes: Buffer): Buffer {
  const invalid = () => { throw new MiniMaxVideoError('VIDEO_RESPONSE_INVALID', 'invalid'); };
  if (!Buffer.isBuffer(bytes) || bytes.length < 24 || bytes.length > MINIMAX_VIDEO_MAX_DOWNLOAD_BYTES) invalid();
  let boxes = 0;
  function walk(start: number, end: number, depth: number): Set<string> {
    if (depth > 8) invalid();
    const types = new Set<string>();
    let offset = start;
    while (offset < end) {
      if (++boxes > 10_000 || end - offset < 8) invalid();
      let size = bytes.readUInt32BE(offset);
      let header = 8;
      const type = bytes.toString('ascii', offset + 4, offset + 8);
      if (size === 1) {
        if (end - offset < 16) invalid();
        const extended = bytes.readBigUInt64BE(offset + 8);
        if (extended > BigInt(end - offset)) invalid();
        size = Number(extended);
        header = 16;
      } else if (size === 0) size = end - offset;
      if (size < header || size > end - offset) invalid();
      const payload = size - header;
      if (type === 'ftyp' && (payload < 8 || payload % 4 !== 0)) invalid();
      if (type === 'mdat' && payload === 0) invalid();
      if (CONTAINER_BOXES.has(type)) {
        const children = walk(offset + header, offset + size, depth + 1);
        if (type === 'moov' && (!children.has('mvhd') || !children.has('trak'))) invalid();
        if (type === 'trak' && (!children.has('tkhd') || !children.has('mdia'))) invalid();
      }
      types.add(type);
      offset += size;
    }
    return types;
  }
  const top = walk(0, bytes.length, 0);
  if (!top.has('ftyp') || !top.has('moov') || !top.has('mdat')) invalid();
  return bytes;
}

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3],
] as const) blocked.addSubnet(address, prefix, 'ipv4');

export type MiniMaxVideoDownloadRequestOptions = RequestOptions & Pick<TcpSocketConnectOpts, 'autoSelectFamily'>;

interface DownloadOptions {
  maxBytes?: number;
  timeoutMs?: number;
  /** Test seams; production uses DNS and HTTPS directly, never an API credential. */
  resolve?: (hostname: string) => Promise<LookupAddress[]>;
  request?: (url: URL, options: MiniMaxVideoDownloadRequestOptions, callback: (response: IncomingMessage) => void) => ClientRequest;
}

/** Retrieve only an already successful task. Codec/visual acceptance happens later.
 * HTTPS connects to a vetted public IPv4 address with normal hostname/TLS checks.
 * No redirects, retries, API key, proxy credentials or shared connection pool. */
export async function downloadMiniMaxVideo(input: MiniMaxVideoTask, options: DownloadOptions = {}): Promise<Buffer> {
  const task = validateMiniMaxVideoTask(input, input.id);
  const invalid = () => new MiniMaxVideoError('VIDEO_RESPONSE_INVALID', 'invalid');
  if (task.status !== 'succeeded' || !task.content.url) throw invalid();
  const url = new URL(task.content.url);
  if (url.protocol !== 'https:' || url.port || isIP(url.hostname.replace(/^\[|\]$/gu, ''))
    || url.username || url.password || url.hash) throw invalid();
  const maxBytes = options.maxBytes ?? MINIMAX_VIDEO_MAX_DOWNLOAD_BYTES;
  const timeoutMs = options.timeoutMs ?? MAX_TIMEOUT_MS;
  if (!Number.isInteger(maxBytes) || maxBytes < 12 || maxBytes > MINIMAX_VIDEO_MAX_DOWNLOAD_BYTES
    || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new MiniMaxVideoError('VIDEO_CONFIG_INVALID', 'invalid');
  }
  const resolve = options.resolve ?? (hostname => lookup(hostname, { family: 4, all: true }));
  const request: NonNullable<DownloadOptions['request']> = options.request ?? get;
  const controller = new AbortController();
  let activeRequest: ClientRequest | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new MiniMaxVideoError('VIDEO_TIMEOUT', 'uncertain'));
      controller.abort();
      activeRequest?.destroy();
    }, timeoutMs);
  });
  const operation = async () => {
    const addresses = await resolve(url.hostname);
    if (controller.signal.aborted) throw new MiniMaxVideoError('VIDEO_TIMEOUT', 'uncertain');
    if (!addresses.length || addresses.some(value => value.family !== 4 || isIP(value.address) !== 4
      || blocked.check(value.address, 'ipv4'))) throw invalid();
    const address = addresses[0].address;
    return new Promise<Buffer>((resolveBytes, reject) => {
      const networkFailure = () => reject(new MiniMaxVideoError('VIDEO_NETWORK_FAILED', 'uncertain'));
      activeRequest = request(url, {
        method: 'GET', family: 4, autoSelectFamily: false, agent: false,
        lookup: (_hostname, _lookupOptions, callback) => callback(null, address, 4),
        signal: controller.signal,
        headers: { Accept: 'video/mp4,application/octet-stream' },
      }, response => {
        response.on('error', networkFailure);
        response.on('aborted', networkFailure);
        const stop = (error: MiniMaxVideoError) => { reject(error); response.destroy(); };
        if (response.statusCode !== 200) {
          stop(new MiniMaxVideoError('VIDEO_HTTP_FAILED', 'invalid', response.statusCode));
          return;
        }
        const length = response.headers['content-length'];
        if (length !== undefined && (typeof length !== 'string' || !/^\d+$/u.test(length)
          || Number(length) > maxBytes)) {
          stop(new MiniMaxVideoError('VIDEO_RESPONSE_TOO_LARGE', 'invalid'));
          return;
        }
        const mime = response.headers['content-type'];
        if (typeof mime !== 'string' || !/^(?:video\/mp4|application\/(?:mp4|octet-stream))(?:\s*;|$)/iu.test(mime)) {
          stop(invalid());
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) stop(new MiniMaxVideoError('VIDEO_RESPONSE_TOO_LARGE', 'invalid'));
          else chunks.push(chunk);
        });
        response.on('end', () => {
          if (length !== undefined && size !== Number(length)) { reject(invalid()); return; }
          try { resolveBytes(validateMiniMaxVideoBytes(Buffer.concat(chunks))); }
          catch { reject(invalid()); }
        });
      });
      activeRequest.on('error', networkFailure);
    });
  };
  try { return await Promise.race([operation(), deadline]); }
  catch (error) {
    if (error instanceof MiniMaxVideoError) throw error;
    throw new MiniMaxVideoError('VIDEO_NETWORK_FAILED', 'uncertain');
  } finally { if (timer) clearTimeout(timer); }
}
