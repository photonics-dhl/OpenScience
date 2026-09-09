import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
const root = '/opt/openscience-chatgpt-browser';
if (fs.existsSync(root + '/egress/egress.sock')) {
  if (!fs.lstatSync(root + '/egress/egress.sock').isSocket()) throw Error('INVALID_EGRESS_SOCKET');
  fs.unlinkSync(root + '/egress/egress.sock');
}
const hosts = new Set(['chatgpt.com', 'auth.openai.com', 'auth0.openai.com', 'cdn.auth0.com',
  'challenges.cloudflare.com', 'persistent.oaistatic.com', 'cdn.oaistatic.com', 'ab.chatgpt.com',
  'files.oaiusercontent.com']);
const allowed = authority => typeof authority === 'string' && authority.endsWith(':443')
  && hosts.has(authority.slice(0, -4));
let active = 0;
const egress = http.createServer({ maxHeaderSize: 8192 }, (_, res) => { res.writeHead(405); res.end(); });
egress.on('connect', (req, client, head) => {
  if (!allowed(req.url) || head.length || active >= 32) {
    console.log('CONNECT_REJECTED', /^[a-z0-9.-]+:443$/.test(req.url ?? '') ? req.url : 'invalid');
    client.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return;
  }
  active++; client.once('close', () => active--); client.on('error', () => client.destroy());
  const request = http.request({ host: '127.0.0.1', port: 7891, method: 'CONNECT', path: req.url,
    headers: { Host: req.url }, timeout: 15000 });
  request.on('connect', (res, upstream, extra) => {
    if (res.statusCode !== 200 || extra.length) { upstream.destroy(); client.destroy(); return; }
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    upstream.on('error', () => client.destroy());
    upstream.once('close', () => client.destroy()); client.once('close', () => upstream.destroy());
    upstream.setTimeout(300000, () => upstream.destroy());
    client.pipe(upstream); upstream.pipe(client);
  });
  request.on('timeout', () => request.destroy()); request.on('error', () => client.destroy()); request.end();
});
egress.on('clientError', (_, socket) => socket.destroy());
egress.listen(root + '/egress/egress.sock', () => fs.chmodSync(root + '/egress/egress.sock', 0o600));
function valid(req) {
  return req.headers.host === '127.0.0.1:6081'
    && (!req.headers.origin || req.headers.origin === 'http://127.0.0.1:6081')
    && (!req.headers['sec-fetch-site'] || ['same-origin', 'none'].includes(req.headers['sec-fetch-site']));
}
const ui = http.createServer((req, res) => {
  if (!valid(req)) { res.writeHead(403); res.end(); return; }
  const upstream = http.request({ socketPath: root + '/control/ui.sock', path: req.url, method: req.method,
    headers: req.headers }, response => {
    res.writeHead(response.statusCode ?? 502, { ...response.headers, 'x-frame-options': 'DENY',
      'content-security-policy': "frame-ancestors 'none'", 'cache-control': 'no-store' }); response.pipe(res);
  });
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Browser is starting'); });
  req.pipe(upstream);
});
ui.on('upgrade', (req, client, head) => {
  if (!valid(req) || req.headers.origin !== 'http://127.0.0.1:6081') { client.destroy(); return; }
  const upstream = net.connect(root + '/control/ui.sock', () => {
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${Object.entries(req.headers).map(([key, value]) => `${key}: ${value}`).join('\r\n')}\r\n\r\n`);
    if (head.length) upstream.write(head); client.pipe(upstream); upstream.pipe(client);
  });
  client.on('error', () => upstream.destroy()); upstream.on('error', () => client.destroy());
  client.once('close', () => upstream.destroy()); upstream.once('close', () => client.destroy());
});
ui.listen(6081, '127.0.0.1');
