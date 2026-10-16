'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const { makeFactory, addQueueClients, makeShutdown, deferred, tick } = require('./server-resource-maintenance-20261015-worker-redis-fixture.cjs');
const mode = process.env.XGS_REDIS_MODE || 'candidate';
test('factory owns shared and per-queue/worker clients, leaving unrelated clients untouched', () => {
  const c = makeFactory(mode), owned = addQueueClients(c.factory), unrelated = new c.Redis({});
  assert.equal(new Set(owned).size, 5);
  assert.equal(typeof c.factory.disconnectAllRedisInstances, 'function');
  assert.equal(c.factory.disconnectAllRedisInstances(), 5);
  assert.deepEqual(owned.map(client => client.calls), [1, 1, 1, 1, 1]);
  assert.equal(unrelated.calls, 0);
  assert.equal(c.factory.disconnectAllRedisInstances(), 0);
  assert.deepEqual(owned.map(client => client.calls), [1, 1, 1, 1, 1]);
});
test('standalone, cluster and sentinel retain their connection parameters and are cleaned', () => {
  for (const [kind, env] of [
    ['standalone', { REDIS_CONNECTION_STRING: undefined, REDIS_HOST: 'fixture.invalid', REDIS_PORT: '6379', REDIS_AUTH: 'fixture-only' }],
    ['cluster', { REDIS_CLUSTER_ENABLED: 'true', REDIS_CLUSTER_NODES: 'fixture.invalid:6379' }],
    ['sentinel', { REDIS_SENTINEL_ENABLED: 'true', REDIS_SENTINEL_MASTER_NAME: 'fixture-master', REDIS_SENTINEL_NODES: 'fixture.invalid:26379' }],
  ]) {
    const c = makeFactory(mode, { env }), created = c.factory.createNewRedisInstance({ connectionName: 'fixture-options' });
    assert.equal(created.kind, kind);
    const options = kind === 'cluster' ? created.options.redisOptions : created.options;
    assert.equal(options.connectionName, 'fixture-options');
    assert.equal(options.enableReadyCheck, true);
    assert.equal(options.maxRetriesPerRequest, null);
    assert.equal(options.keepAlive, 10000);
    assert.equal(c.factory.disconnectAllRedisInstances(), 2);
    assert.deepEqual(c.clients.map(client => client.calls), [1, 1]);
  }
});
test('unconfigured or invalid Redis configurations register no phantom client', () => {
  for (const env of [
    { REDIS_CONNECTION_STRING: undefined },
    { REDIS_CLUSTER_ENABLED: 'true', REDIS_SENTINEL_ENABLED: 'true' },
    { REDIS_CLUSTER_ENABLED: 'true' },
    { REDIS_SENTINEL_ENABLED: 'true' },
    { REDIS_SENTINEL_ENABLED: 'true', REDIS_SENTINEL_MASTER_NAME: 'fixture-master' },
  ]) {
    const c = makeFactory(mode, { env });
    assert.equal(c.factory.redis, null);
    assert.equal(c.factory.createNewRedisInstance(), null);
    assert.equal(c.clients.length, 0);
    assert.equal(c.factory.disconnectAllRedisInstances(), 0);
  }
});
test('ended instances are pruned and shared registration does not duplicate end listeners', () => {
  const c = makeFactory(mode), owned = addQueueClients(c.factory);
  assert.equal(c.factory.redis.listenerCount('end'), 1);
  owned[2].status = 'end'; owned[2].emit('end');
  assert.equal(c.factory.disconnectAllRedisInstances(), 4);
  assert.deepEqual(owned.map(client => client.calls), [1, 1, 0, 1, 1]);
});
test('global shared cache remains owned once; already ended cached clients are ignored', () => {
  class Cached extends EventEmitter {
    constructor(status) { super(); this.status = status; this.calls = 0; }
    disconnect() { this.calls++; this.status = 'end'; this.emit('end'); }
  }
  const shared = new Cached('ready');
  const c = makeFactory(mode, { globals: { redis: shared } });
  assert.strictEqual(c.factory.redis, shared); assert.equal(c.clients.length, 0);
  assert.equal(shared.listenerCount('end'), 1);
  assert.equal(c.factory.disconnectAllRedisInstances(), 1); assert.equal(shared.calls, 1);
  assert.equal(c.factory.disconnectAllRedisInstances(), 0);
  const ended = new Cached('end'), d = makeFactory(mode, { globals: { redis: ended } });
  assert.strictEqual(d.factory.redis, ended);
  assert.equal(ended.listenerCount('end'), 0);
  assert.equal(d.factory.disconnectAllRedisInstances(), 0); assert.equal(ended.calls, 0);
});
test('cleanup attempts all clients, propagates a safe failure and retains only failed ownership', () => {
  const c = makeFactory(mode), owned = addQueueClients(c.factory); owned[1].fail = true;
  assert.throws(() => c.factory.disconnectAllRedisInstances(), error => {
    assert.match(error.message, /1/); assert(!error.message.includes('private-connection'));
    assert.equal(error.cause, undefined); return true;
  });
  assert.deepEqual(owned.map(client => client.calls), [1, 1, 1, 1, 1]);
  assert(!JSON.stringify(c.logs).includes('private-connection'));
  owned[1].fail = false;
  assert.equal(c.factory.disconnectAllRedisInstances(), 1);
  assert.deepEqual(owned.map(client => client.calls), [1, 2, 1, 1, 1]);
});
test('real combined shutdown waits for workers, migration and Writer before Redis and SDK', async () => {
  const c = makeFactory(mode), owned = addQueueClients(c.factory);
  const workersGate = deferred(), migrationGate = deferred(), writerGate = deferred();
  const s = makeShutdown(mode, c, { workersGate, migrationGate, writerGate });
  const pending = s.shutdown.onShutdown('SIGTERM');
  await tick(); assert.deepEqual(owned.map(client => client.calls), [0, 0, 0, 0, 0]);
  workersGate.resolve(); await tick(); assert(c.order.includes('migration:done'));
  assert.deepEqual(owned.map(client => client.calls), [0, 0, 0, 0, 0]);
  migrationGate.resolve(); await tick(); assert(c.order.includes('writer:done'));
  assert.deepEqual(owned.map(client => client.calls), [0, 0, 0, 0, 0]);
  writerGate.resolve(); await pending;
  assert.deepEqual(owned.map(client => client.calls), [1, 1, 1, 1, 1]);
  assert(c.order.indexOf('writer:done') < c.order.indexOf('redis:0'));
  assert(c.order.indexOf('redis:4') < c.order.indexOf('prisma:disconnect'));
  assert(c.order.indexOf('tokenizers:free') < c.order.indexOf('sdk:done'));
  assert.equal(s.sdkCalls(), 1); assert.equal(s.complete(), true);
});
test('Redis failure rejects the shared drain without retry or downstream success', async () => {
  const c = makeFactory(mode), owned = addQueueClients(c.factory); owned[1].fail = true;
  const s = makeShutdown(mode, c), pending = s.shutdown.drainAndClose();
  await assert.rejects(pending, error => !error.message.includes('private-connection'));
  assert.strictEqual(s.shutdown.drainAndClose(), pending);
  await assert.rejects(s.shutdown.onShutdown('SIGINT'));
  assert.deepEqual(owned.map(client => client.calls), [1, 1, 1, 1, 1]);
  assert.equal(s.sdkCalls(), 0); assert.equal(s.complete(), false);
  assert(!c.order.includes('prisma:disconnect'));
  assert(!c.logs.some(row => row.args[0] === 'Redis disconnect has been requested for all owned connections.'));
  assert(!JSON.stringify(c.logs).includes('private-connection'));
});
test('failed business drain does not close Redis clients or report SDK completion', async () => {
  const c = makeFactory(mode), owned = addQueueClients(c.factory), workersGate = deferred();
  const s = makeShutdown(mode, c, { workersGate }), failure = Error('fixture-business-failed');
  const pending = s.shutdown.onShutdown('SIGTERM'); workersGate.reject(failure);
  await assert.rejects(pending, error => error === failure);
  assert.deepEqual(owned.map(client => client.calls), [0, 0, 0, 0, 0]);
  assert.equal(s.sdkCalls(), 0); assert.equal(s.complete(), false);
});
