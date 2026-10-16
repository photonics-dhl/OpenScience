'use strict';
// Native ioredis transport characterization. No app import, queue consumer or external Redis.
const fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const cp = require('node:child_process'), assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { test } = require('node:test');
const { files, makeFactory, addQueueClients, makeShutdown } = require('./server-resource-maintenance-20261015-worker-redis-fixture.cjs');
const mode = process.env.XGS_REDIS_MODE || 'candidate';
async function child() {
  let nativeRequire, ioredis, Parser, version;
  try {
    const anchor = process.env.XGS_REDIS_IMAGE === '1' ? files(mode).factory
      : path.join(__dirname, '../node_modules/.pnpm/ioredis@5.11.1/node_modules/ioredis/built/index.js');
    nativeRequire = createRequire(anchor);
    ioredis = nativeRequire('ioredis');
    const ioredisRequire = createRequire(nativeRequire.resolve('ioredis'));
    Parser = ioredisRequire('redis-parser');
    version = ioredisRequire('./../package.json').version;
  } catch {
    console.error('NATIVE_DEPENDENCY_SETUP_FAILED'); process.exitCode = 1; return;
  }
  const failures = [];
  const fail = code => { failures.push(code); console.error(code); process.exitCode = 1; };
  const server = net.createServer(socket => {
    socket.unref(); socket.on('error', () => fail('LOOPBACK_SOCKET_FAILED'));
    const parser = new Parser({
      returnReply(command) {
        if (!Array.isArray(command)) { fail('LOOPBACK_INVALID_COMMAND'); return; }
        const name = String(command[0]).toLowerCase();
        if (name === 'info') {
          const info = 'redis_version:7.0.0\r\nloading:0\r\n';
          socket.write('$' + Buffer.byteLength(info) + '\r\n' + info + '\r\n');
        } else if (name === 'client' || name === 'select') socket.write('+OK\r\n');
        else if (name === 'ping') socket.write('+PONG\r\n');
        else if (name === 'quit') socket.end('+OK\r\n');
        else fail('LOOPBACK_UNSUPPORTED_COMMAND');
      },
      returnError() { fail('LOOPBACK_PARSE_FAILED'); },
      returnFatalError() { fail('LOOPBACK_PARSE_FAILED'); },
    });
    socket.on('data', data => parser.execute(data));
  });
  server.on('error', () => fail('LOOPBACK_LISTEN_FAILED'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); server.unref();
  const c = makeFactory(mode, { ioredis, env: { REDIS_CONNECTION_STRING: 'redis://127.0.0.1:' + server.address().port } });
  const clients = addQueueClients(c.factory);
  for (const client of clients) client.on('error', () => fail('NATIVE_CLIENT_ERROR'));
  await Promise.all(clients.map(client => new Promise((resolve, reject) => {
    client.once('error', () => reject(Error('NATIVE_READY_FAILED')));
    if (client.status === 'ready') resolve(); else client.once('ready', resolve);
  })));
  assert.equal(failures.length, 0); assert.equal(clients.length, 5);
  console.log(JSON.stringify({ marker: 'CLIENTS_READY', clients: 5, version }));
  let ended = 0;
  for (const client of clients) client.once('end', () => {
    ended++;
    if (ended === 5) console.log(JSON.stringify({ marker: 'ALL_CLIENTS_ENDED', clients: ended }));
  });
  const s = makeShutdown(mode, c);
  await s.shutdown.onShutdown('SIGTERM');
  assert.equal(s.complete(), true); assert.equal(s.sdkCalls(), 1);
  assert.deepEqual(c.order.filter(x => /^(workers|migration|writer|sdk):/.test(x)),
    ['workers:done', 'migration:done', 'writer:done', 'sdk:done']);
  console.log(JSON.stringify({ marker: 'BUSINESS_AND_SDK_HOOK_COMPLETE', sdkHookCalls: 1, complete: true }));
  // Fixture server and peer sockets are unref'd. Only real client ownership can retain this child.
}
if (process.argv[2] === '--child') {
  child().catch(() => { console.error('NATIVE_CHILD_SETUP_OR_DRAIN_FAILED'); process.exitCode = 1; });
} else test('native factory-owned sockets end after business drain within the original 2s child budget', t => {
  const result = cp.spawnSync(process.execPath, [__filename, '--child'], {
    encoding: 'utf8', timeout: 2000, env: { ...process.env, XGS_REDIS_MODE: mode },
  });
  assert.equal(result.stderr, '', 'dependency/handshake/drain failure is not lifecycle RED');
  const markers = result.stdout.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  assert(markers.some(x => x.marker === 'CLIENTS_READY' && x.clients === 5 && typeof x.version === 'string'));
  assert(markers.some(x => x.marker === 'BUSINESS_AND_SDK_HOOK_COMPLETE' && x.sdkHookCalls === 1 && x.complete === true));
  t.diagnostic('NATIVE_DEPENDENCY:' + JSON.stringify(markers.find(x => x.marker === 'CLIENTS_READY')));
  if (result.error) {
    assert.equal(result.error.code, 'ETIMEDOUT');
    assert(!markers.some(x => x.marker === 'ALL_CLIENTS_ENDED'));
    t.diagnostic('CONTROL_NATIVE_CLIENTS_READY_AND_DRAIN_COMPLETE');
  }
  assert.equal(result.error, undefined, 'ready owned client sockets prevent natural exit: ' + result.error?.code);
  assert.equal(result.status, 0);
  assert(markers.some(x => x.marker === 'ALL_CLIENTS_ENDED' && x.clients === 5));
});
