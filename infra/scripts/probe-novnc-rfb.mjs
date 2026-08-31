#!/usr/bin/env node

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { createConnection } from 'node:net';

const failure = () => new Error('RFB probe failed');

export function probeRfb(endpoint, timeoutMs = 1_500) {
  const match = /^ws:\/\/127\.0\.0\.1:([0-9]{1,5})\/websockify$/u.exec(endpoint);
  const port = Number(match?.[1]);
  if (!match || !Number.isSafeInteger(port) || port < 1024 || port > 65535
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 5_000) return Promise.reject(failure());

  return new Promise((resolveProbe, rejectProbe) => {
    let settled = false;
    let received = Buffer.alloc(0);
    const key = randomBytes(16).toString('base64');
    const expectedAccept = createHash('sha1')
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64');
    const socket = createConnection({ host: '127.0.0.1', port });
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) rejectProbe(failure());
      else resolveProbe();
    };
    const timer = setTimeout(() => finish(true), timeoutMs);
    socket.once('connect', () => socket.write([
      'GET /websockify HTTP/1.1',
      `Host: 127.0.0.1:${port}`,
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Key: ${key}`,
      'Sec-WebSocket-Version: 13',
      'Sec-WebSocket-Protocol: binary',
      '',
      '',
    ].join('\r\n')));
    socket.on('data', (chunk) => {
      received = Buffer.concat([received, chunk]);
      if (received.length > 8_192) return finish(true);
      const headerEnd = received.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const headers = received.subarray(0, headerEnd).toString('ascii');
      if (!/^HTTP\/1\.1 101 /u.test(headers)
        || !new RegExp(`^Sec-WebSocket-Accept: ${expectedAccept.replaceAll('+', '\\+')}\\r?$`, 'imu').test(headers)
        || !/^Sec-WebSocket-Protocol: binary\r?$/imu.test(headers)) return finish(true);
      const frame = received.subarray(headerEnd + 4);
      if (frame.length < 2) return;
      if ((frame[0] & 0x0f) !== 2 || (frame[1] & 0x80) !== 0) return finish(true);
      let length = frame[1] & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (frame.length < 4) return;
        length = frame.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) return finish(true);
      if (frame.length < offset + length) return;
      const banner = frame.subarray(offset, offset + length).toString('ascii');
      finish(!/^RFB 003\.[0-9]{3}\n$/u.test(banner));
    });
    socket.once('error', () => finish(true));
    socket.once('close', () => finish(true));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await probeRfb(process.argv[2] ?? '');
    process.stdout.write('RFB_OK\n');
  } catch {
    process.stderr.write('RFB probe failed\n');
    process.exitCode = 1;
  }
}
