import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';

import { probeRfb } from './probe-novnc-rfb.mjs';

async function startFixture(t, { payload = 'RFB 003.008\n', websocket = true } = {}) {
  const server = createServer((request, response) => {
    const ok = request.url === '/vnc.html?autoconnect=true&resize=remote';
    response.writeHead(ok ? 200 : 404);
    response.end(ok ? 'noVNC' : 'not found');
  });
  server.on('upgrade', (request, socket) => {
    if (!websocket || request.url !== '/websockify' || !request.headers['sec-websocket-key']) {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      return;
    }
    const accept = createHash('sha1')
      .update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64');
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      'Sec-WebSocket-Protocol: binary',
      '',
      '',
    ].join('\r\n'));
    const body = Buffer.from(payload, 'ascii');
    socket.end(Buffer.concat([Buffer.from([0x82, body.length]), body]));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return server.address().port;
}

test('accepts only a loopback websockify endpoint that emits an RFB banner', async (t) => {
  const port = await startFixture(t);
  await assert.doesNotReject(probeRfb(`ws://127.0.0.1:${port}/websockify`, 1_000));
});

test('rejects a static-only endpoint and a malformed backend banner', async (t) => {
  const staticPort = await startFixture(t, { websocket: false });
  const malformedPort = await startFixture(t, { payload: 'not-rfb' });
  await assert.rejects(probeRfb(`ws://127.0.0.1:${staticPort}/websockify`, 1_000), /RFB probe failed/u);
  await assert.rejects(probeRfb(`ws://127.0.0.1:${malformedPort}/websockify`, 1_000), /RFB probe failed/u);
});

test('rejects non-loopback and non-websockify targets before connecting', async () => {
  await assert.rejects(probeRfb('ws://example.com/websockify', 1_000), /RFB probe failed/u);
  await assert.rejects(probeRfb('ws://127.0.0.1:6080/other', 1_000), /RFB probe failed/u);
});
