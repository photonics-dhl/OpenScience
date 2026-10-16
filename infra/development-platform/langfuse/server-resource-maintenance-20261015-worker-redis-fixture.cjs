'use strict';
// Executes the captured compiled sources; only external I/O dependencies are replaced.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const stem = 'server-resource-maintenance-20261015-';
const local = name => path.join(__dirname, stem + name);
const imageFactory = '/app/worker/node_modules/.pnpm/@langfuse+shared@file++++app+packages+shared/node_modules/@langfuse/shared/dist/src/server/redis/redis.js';
function files(mode) {
  if (process.env.XGS_REDIS_IMAGE === '1') return {
    factory: imageFactory, shutdown: '/app/worker/dist/utils/shutdown.js',
  };
  return {
    factory: local(mode === 'original' ? 'installed-shared-redis.js' : 'worker-redis-candidate-factory.js'),
    // The negative control already has the reviewed A SDK cleanup.
    shutdown: local(mode === 'original' ? 'candidate-utils-shutdown.js' : 'worker-redis-candidate-shutdown.js'),
  };
}
function evaluate(file, require, globals = {}) {
  const exports = {};
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    exports, require, globalThis: globals, URL, Map, Set, Promise,
    process: { exit() { throw Error('ForcedExitForbidden'); } },
  }, { filename: file });
  return exports;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  promise.catch(() => {});
  return { promise, resolve, reject };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
function makeFactory(mode, options = {}) {
  const order = options.order || [], logs = [], clients = [];
  class Redis extends EventEmitter {
    constructor(...args) {
      super(); this.args = args; this.options = args.at(-1) || {};
      this.status = 'ready'; this.calls = 0; this.fail = false;
      this.kind = this.options.sentinels ? 'sentinel' : 'standalone';
      clients.push(this);
    }
    disconnect() {
      this.calls++; order.push('redis:' + clients.indexOf(this));
      if (this.fail) throw Error('private-connection-context-must-not-escape');
      this.status = 'end'; this.emit('end');
    }
  }
  class Cluster extends Redis {
    constructor(...args) { super(...args); this.kind = 'cluster'; }
  }
  const logger = Object.fromEntries(['info', 'error', 'warn', 'debug'].map(level =>
    [level, (...args) => logs.push({ level, args })]));
  const env = { NODE_ENV: 'production', REDIS_CONNECTION_STRING: 'redis://fixture.invalid:6379', ...options.env };
  const native = options.ioredis || { __esModule: true, default: Redis, Cluster };
  const factory = evaluate(files(mode).factory, id => {
    if (id === 'ioredis') return native;
    if (id === 'fs') return fs;
    if (id === '../../env') return { env };
    if (id === '../logger') return { logger };
    if (id === './redisErrorContext') return {
      buildRedisErrorContext: () => ({}), formatRedisErrorMessage: () => 'fixture-redis-error',
      getLastNodeError: () => undefined,
    };
    throw Error('UnexpectedFactoryImport:' + id);
  }, options.globals || {});
  return { factory, clients, order, logs, env, logger, Redis };
}
function addQueueClients(factory) {
  return [factory.redis,
    factory.createBullMQQueueOptionsWithRedis('fixture-one').connection,
    factory.createBullMQWorkerOptionsWithRedis('fixture-one').connection,
    factory.createBullMQQueueOptionsWithRedis('fixture-two').connection,
    factory.createBullMQWorkerOptionsWithRedis('fixture-two').connection];
}
function makeShutdown(mode, context, options = {}) {
  const { factory, order, logger } = context;
  let sdkCalls = 0;
  const server = { ...factory, logger, ClickHouseClientManager: {
    getInstance: () => ({ async closeAllConnections() { order.push('ch:close'); } }),
  } };
  const boundary = (name, gate) => () => { order.push(name); return gate?.promise || Promise.resolve(); };
  const modules = {
    '@langfuse/shared/src/server': server,
    '../services/ClickhouseWriter': { ClickhouseWriter: { getInstance: () => ({ shutdown: boundary('writer:done', options.writerGate) }) } },
    '../features/health': { setSigtermReceived() { order.push('sigterm'); } },
    '../index': { server: { close() { order.push('http:close'); } } },
    '../features/tokenisation/usage': { freeAllTokenizers() { order.push('tokenizers:free'); } },
    '../features/tokenisation/async-usage': { getTokenCountWorkerManager: () => ({ terminate: boundary('tokenizers:terminate') }) },
    '../queues/workerManager': { WorkerManager: { closeWorkers: boundary('workers:done', options.workersGate) } },
    '../features/blobstorage/inFlightExports': { logInFlightBlobExportsOnShutdown() {} },
    '../features/in-app-agent/executeInAppAgentRun': { abortActiveInAppAgentRuns() {} },
    '@langfuse/shared/src/db': { prisma: { $disconnect: boundary('prisma:disconnect') } },
    '../backgroundMigrations/backgroundMigrationManager': { BackgroundMigrationManager: { close: boundary('migration:done', options.migrationGate) } },
    '../app': { batchProjectCleaners: [], batchDataRetentionCleaners: [], monitorRunners: [] },
    '../instrumentation': { shutdownInstrumentation() { sdkCalls++; order.push('sdk:done'); return Promise.resolve(); } },
  };
  const shutdown = evaluate(files(mode).shutdown, id => {
    if (!(id in modules)) throw Error('UnexpectedShutdownImport:' + id);
    return modules[id];
  });
  return { shutdown, sdkCalls: () => sdkCalls,
    complete: () => context.logs.some(row => row.args[0] === 'Shutdown complete, exiting process...') };
}
module.exports = { files, evaluate, deferred, tick, makeFactory, addQueueClients, makeShutdown };
