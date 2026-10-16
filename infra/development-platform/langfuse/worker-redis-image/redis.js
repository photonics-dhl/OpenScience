"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.disconnectAllRedisInstances = exports.redis = exports.scanKeys = exports.safeMultiGet = exports.safeMultiDel = exports.createBullMQWorkerOptionsWithRedis = exports.createBullMQQueueOptionsWithRedis = exports.getQueuePrefix = exports.createNewRedisInstance = exports.redisQueueRetryOptions = void 0;
const ioredis_1 = __importStar(require("ioredis"));
const fs_1 = __importDefault(require("fs"));
const env_1 = require("../../env");
const logger_1 = require("../logger");
const redisErrorContext_1 = require("./redisErrorContext");
const logRedisError = (prefix, error, nodeAddress) => {
    const context = (0, redisErrorContext_1.buildRedisErrorContext)(error, nodeAddress);
    logger_1.logger.error((0, redisErrorContext_1.formatRedisErrorMessage)(prefix, context), context);
};
const defaultRedisOptions = {
    enableReadyCheck: true,
    maxRetriesPerRequest: null,
    enableAutoPipelining: env_1.env.REDIS_ENABLE_AUTO_PIPELINING === "true",
    keepAlive: 10000, // 10s — prevents middleboxes from killing idle connections
    // Forces reconnect if no data received, prevents hung moveToCompleted() from
    // blocking concurrency slots forever. ioredis arms the watchdog for any
    // defined value (0 would time out instantly), so disabling requires omitting
    // the option entirely.
    ...(env_1.env.REDIS_SOCKET_TIMEOUT_MS > 0
        ? { socketTimeout: env_1.env.REDIS_SOCKET_TIMEOUT_MS }
        : {}),
};
const REDIS_SCAN_COUNT = 1000;
exports.redisQueueRetryOptions = {
    retryStrategy: (times) => {
        if (times >= 5) {
            // A few retries are expected and no cause for action.
            logger_1.logger.warn(`Connection to redis lost. Retry attempt: ${times}`);
        }
        // Retries forever. Exponential base delay clamped to 1s–20s, plus up to
        // 50% random jitter (so at most 30s), so the per-queue connections do not
        // reconnect in lockstep when Redis becomes unreachable.
        const delay = Math.max(Math.min(Math.exp(times), 20000), 1000);
        return delay + Math.random() * delay * 0.5;
    },
    reconnectOnError: (err) => {
        // MOVED/ASK are normal cluster redirections handled by ioredis — not real errors.
        if (err.message.includes("MOVED")) {
            logger_1.logger.debug(`Redis cluster redirect: ${err.message}`);
            return false;
        }
        // Reconnects on READONLY errors and auto-retries the command.
        logger_1.logger.warn(`Redis connection error: ${err.message}`);
        return err.message.includes("READONLY") ? 2 : false;
    },
};
/**
 * Parse Redis node definitions from environment variable
 * Format: "host1:port1,host2:port2,host3:port3"
 */
const parseRedisNodes = (nodesString) => {
    return nodesString.split(",").map((node) => {
        const [host, port] = node.trim().split(":");
        if (!host || !port) {
            throw new Error(`Invalid Redis node format: ${node}. Expected format: host:port`);
        }
        return { host, port: parseInt(port, 10) };
    });
};
const parseClusterNodes = parseRedisNodes;
const parseSentinelNodes = parseRedisNodes;
/**
 * Build TLS options for Redis connections from environment variables
 * Returns an object with tls configuration if TLS is enabled, otherwise empty object
 */
const buildTlsOptions = () => {
    if (env_1.env.REDIS_TLS_ENABLED !== "true") {
        return {};
    }
    return {
        tls: {
            ca: env_1.env.REDIS_TLS_CA_PATH
                ? fs_1.default.readFileSync(env_1.env.REDIS_TLS_CA_PATH)
                : undefined,
            cert: env_1.env.REDIS_TLS_CERT_PATH
                ? fs_1.default.readFileSync(env_1.env.REDIS_TLS_CERT_PATH)
                : undefined,
            key: env_1.env.REDIS_TLS_KEY_PATH
                ? fs_1.default.readFileSync(env_1.env.REDIS_TLS_KEY_PATH)
                : undefined,
            ...(env_1.env.REDIS_TLS_REJECT_UNAUTHORIZED
                ? {
                    rejectUnauthorized: env_1.env.REDIS_TLS_REJECT_UNAUTHORIZED !== "false",
                }
                : {}),
            ...(env_1.env.REDIS_TLS_SERVERNAME
                ? { servername: env_1.env.REDIS_TLS_SERVERNAME }
                : {}),
            ...(env_1.env.REDIS_TLS_CHECK_SERVER_IDENTITY === "false"
                ? { checkServerIdentity: () => undefined }
                : {}),
            ...(env_1.env.REDIS_TLS_SECURE_PROTOCOL
                ? { secureProtocol: env_1.env.REDIS_TLS_SECURE_PROTOCOL }
                : {}),
            ...(env_1.env.REDIS_TLS_CIPHERS ? { ciphers: env_1.env.REDIS_TLS_CIPHERS } : {}),
            ...(env_1.env.REDIS_TLS_HONOR_CIPHER_ORDER
                ? {
                    honorCipherOrder: env_1.env.REDIS_TLS_HONOR_CIPHER_ORDER === "true",
                }
                : {}),
            ...(env_1.env.REDIS_TLS_KEY_PASSPHRASE
                ? { passphrase: env_1.env.REDIS_TLS_KEY_PASSPHRASE }
                : {}),
        },
    };
};
const createRedisClusterInstance = (additionalOptions = {}) => {
    if (!env_1.env.REDIS_CLUSTER_NODES) {
        logger_1.logger.error("REDIS_CLUSTER_NODES is required when REDIS_CLUSTER_ENABLED is true");
        return null;
    }
    const nodes = parseClusterNodes(env_1.env.REDIS_CLUSTER_NODES);
    const tlsOptions = buildTlsOptions();
    const clusterOptions = {
        // Return incoming addresses as-is - required for AWS ElastiCache Certificate resolution
        dnsLookup: (address, callback) => {
            callback(null, address);
        },
        slotsRefreshTimeout: env_1.env.REDIS_CLUSTER_SLOTS_REFRESH_TIMEOUT,
        redisOptions: {
            username: env_1.env.REDIS_USERNAME || undefined,
            password: env_1.env.REDIS_AUTH || undefined,
            ...defaultRedisOptions,
            ...additionalOptions,
            ...tlsOptions,
        },
        // Retry configuration for cluster
        retryDelayOnFailover: 100,
    };
    const cluster = new ioredis_1.Cluster(nodes, clusterOptions);
    // The `node error` event is the only place ioredis reports which node failed.
    let lastNodeFailure;
    cluster.on("node error", (error, address) => {
        lastNodeFailure = { error, address };
    });
    cluster.on("error", (error) => {
        const lastNodeError = (0, redisErrorContext_1.getLastNodeError)(error);
        const nodeAddress = lastNodeError !== undefined && lastNodeFailure?.error === lastNodeError
            ? lastNodeFailure.address
            : undefined;
        logRedisError("Redis cluster error", error, nodeAddress);
    });
    return cluster;
};
const createRedisSentinelInstance = (additionalOptions = {}) => {
    if (!env_1.env.REDIS_SENTINEL_MASTER_NAME) {
        logger_1.logger.error("REDIS_SENTINEL_MASTER_NAME is required when REDIS_SENTINEL_ENABLED is true");
        return null;
    }
    if (!env_1.env.REDIS_SENTINEL_NODES) {
        logger_1.logger.error("REDIS_SENTINEL_NODES is required when REDIS_SENTINEL_ENABLED is true");
        return null;
    }
    const sentinels = parseSentinelNodes(env_1.env.REDIS_SENTINEL_NODES);
    const tlsOptions = buildTlsOptions();
    const sentinelTlsRequested = env_1.env.REDIS_SENTINEL_TLS_ENABLED === "true";
    const redisTlsEnabled = env_1.env.REDIS_TLS_ENABLED === "true";
    if (sentinelTlsRequested && !redisTlsEnabled) {
        logger_1.logger.warn("REDIS_SENTINEL_TLS_ENABLED is true but REDIS_TLS_ENABLED is false; sentinel TLS will not be applied");
    }
    const instance = new ioredis_1.default({
        sentinels,
        name: env_1.env.REDIS_SENTINEL_MASTER_NAME,
        username: env_1.env.REDIS_USERNAME || undefined,
        password: env_1.env.REDIS_AUTH || undefined,
        sentinelUsername: env_1.env.REDIS_SENTINEL_USERNAME || undefined,
        sentinelPassword: env_1.env.REDIS_SENTINEL_PASSWORD || undefined,
        ...(sentinelTlsRequested && redisTlsEnabled && tlsOptions.tls
            ? {
                enableTLSForSentinelMode: true,
                sentinelTLS: tlsOptions.tls,
            }
            : {}),
        ...defaultRedisOptions,
        ...additionalOptions,
        ...tlsOptions,
    });
    instance.on("error", (error) => {
        logRedisError("Redis sentinel error", error);
    });
    return instance;
};
// Factory-created clients remain caller-owned after BullMQ workers/queues close.
const redisInstances = new Set();
const trackRedisInstance = (instance) => {
    if (instance && instance.status !== "end" && !redisInstances.has(instance)) {
        redisInstances.add(instance);
        instance.once("end", () => redisInstances.delete(instance));
    }
    return instance;
};
const disconnectAllRedisInstances = () => {
    let disconnected = 0;
    let failed = 0;
    for (const instance of Array.from(redisInstances)) {
        try {
            instance.disconnect();
            redisInstances.delete(instance);
            disconnected++;
        }
        catch {
            // Retain failed ownership without disclosing connection/error details.
            failed++;
        }
    }
    if (failed > 0) {
        throw new Error(`Failed to close ${failed} Redis connection(s)`);
    }
    return disconnected;
};
exports.disconnectAllRedisInstances = disconnectAllRedisInstances;
const createNewRedisInstance = (additionalOptions = {}) => {
    if (env_1.env.REDIS_CLUSTER_ENABLED === "true" &&
        env_1.env.REDIS_SENTINEL_ENABLED === "true") {
        logger_1.logger.error("Invalid Redis configuration: REDIS_CLUSTER_ENABLED and REDIS_SENTINEL_ENABLED cannot both be true");
        return null;
    }
    if (env_1.env.REDIS_CLUSTER_ENABLED === "true") {
        return trackRedisInstance(createRedisClusterInstance(additionalOptions));
    }
    if (env_1.env.REDIS_SENTINEL_ENABLED === "true") {
        return trackRedisInstance(createRedisSentinelInstance(additionalOptions));
    }
    const tlsOptions = buildTlsOptions();
    const instance = env_1.env.REDIS_CONNECTION_STRING
        ? new ioredis_1.default(env_1.env.REDIS_CONNECTION_STRING, {
            ...defaultRedisOptions,
            ...additionalOptions,
            ...tlsOptions,
        })
        : env_1.env.REDIS_HOST
            ? new ioredis_1.default({
                host: String(env_1.env.REDIS_HOST),
                port: Number(env_1.env.REDIS_PORT),
                username: env_1.env.REDIS_USERNAME || undefined,
                password: String(env_1.env.REDIS_AUTH),
                ...defaultRedisOptions,
                ...additionalOptions,
                ...tlsOptions,
            })
            : null;
    instance?.on("error", (error) => {
        logRedisError("Redis error", error);
    });
    return trackRedisInstance(instance);
};
exports.createNewRedisInstance = createNewRedisInstance;
/**
 * Get the queue prefix for BullMQ cluster compatibility
 * In cluster mode, uses hash tags to ensure queue keys are on the same node
 * In single-node mode, returns the configured prefix or undefined
 */
const getQueuePrefix = (queueName) => {
    const redisKeyPrefix = env_1.env.REDIS_KEY_PREFIX;
    if (env_1.env.REDIS_CLUSTER_ENABLED === "true") {
        // Use hash tags for Redis cluster compatibility
        // This ensures all keys for a queue are placed on the same hash slot
        // Format: {prefix:queueName} ensures all keys land on same slot
        return redisKeyPrefix
            ? `{${redisKeyPrefix}:${queueName}}`
            : `{${queueName}}`;
    }
    // Non-cluster mode: Return prefix or undefined
    return redisKeyPrefix ?? undefined;
};
exports.getQueuePrefix = getQueuePrefix;
const getBullMQOptionsForRedisConnection = (queueName, connection) => ({
    connection,
    prefix: (0, exports.getQueuePrefix)(queueName),
    ...(env_1.env.LANGFUSE_BULLMQ_SKIP_REDIS_VERSION_CHECK === "true"
        ? { skipVersionCheck: true }
        : {}),
});
/**
 * Creates a new Redis connection and returns the BullMQ queue options that use it.
 * Returns null only when the Redis connection cannot be created.
 */
const createBullMQQueueOptionsWithRedis = (queueName) => {
    const connection = (0, exports.createNewRedisInstance)({
        enableOfflineQueue: false,
        ...exports.redisQueueRetryOptions,
    });
    return connection
        ? getBullMQOptionsForRedisConnection(queueName, connection)
        : null;
};
exports.createBullMQQueueOptionsWithRedis = createBullMQQueueOptionsWithRedis;
/**
 * Creates a new Redis connection and returns the BullMQ worker options that use it.
 * Returns null only when the Redis connection cannot be created.
 */
const createBullMQWorkerOptionsWithRedis = (queueName) => {
    const connection = (0, exports.createNewRedisInstance)(exports.redisQueueRetryOptions);
    return connection
        ? getBullMQOptionsForRedisConnection(queueName, connection)
        : null;
};
exports.createBullMQWorkerOptionsWithRedis = createBullMQWorkerOptionsWithRedis;
/**
 * Execute multiple Redis DEL operations safely in cluster mode
 */
const safeMultiDel = async (redis, keys) => {
    if (!redis || keys.length === 0)
        return;
    if (env_1.env.REDIS_CLUSTER_ENABLED === "true") {
        // In cluster mode, delete keys in separate commands to avoid CROSSSLOT errors
        await Promise.all(keys.map(async (key) => redis.del(key)));
    }
    else {
        // In single-node mode, can delete all keys at once
        await redis.del(keys);
    }
};
exports.safeMultiDel = safeMultiDel;
/**
 * Execute multiple Redis GET operations safely in cluster mode.
 * MGET requires all keys to hash to the same slot; fall back to per-key GET.
 */
const safeMultiGet = async (redis, keys) => {
    if (!redis || keys.length === 0)
        return [];
    if (env_1.env.REDIS_CLUSTER_ENABLED === "true") {
        return Promise.all(keys.map(async (key) => redis.get(key)));
    }
    return redis.mget(keys);
};
exports.safeMultiGet = safeMultiGet;
const scanKeysForNode = async (client, pattern, collector, keyPrefix) => {
    let cursor = "0";
    // ioredis keyPrefix is not applied to SCAN patterns, but it is applied to
    // DEL/GET/SET keys. Scan physical keys and return logical keys to callers.
    const scanPattern = keyPrefix ? `${keyPrefix}${pattern}` : pattern;
    do {
        const [nextCursor, keys] = await client.scan(cursor, "MATCH", scanPattern, "COUNT", REDIS_SCAN_COUNT);
        keys.forEach((key) => collector.add(keyPrefix && key.startsWith(keyPrefix)
            ? key.slice(keyPrefix.length)
            : key));
        cursor = nextCursor;
    } while (cursor !== "0");
};
const getRedisKeyPrefix = (redis) => {
    const keyPrefix = redis.options?.keyPrefix ??
        (redis instanceof ioredis_1.Cluster ? redis.options.redisOptions?.keyPrefix : "");
    return keyPrefix?.toString() ?? "";
};
const scanKeys = async (redis, pattern) => {
    if (!redis)
        return [];
    const collectedKeys = new Set();
    const keyPrefix = getRedisKeyPrefix(redis);
    if (env_1.env.REDIS_CLUSTER_ENABLED === "true") {
        await Promise.all(redis
            .nodes("master")
            .map((node) => scanKeysForNode(node, pattern, collectedKeys, keyPrefix)));
    }
    else {
        await scanKeysForNode(redis, pattern, collectedKeys, keyPrefix);
    }
    return Array.from(collectedKeys);
};
exports.scanKeys = scanKeys;
const createRedisClient = () => {
    try {
        return (0, exports.createNewRedisInstance)({
            keyPrefix: env_1.env.REDIS_KEY_PREFIX ?? undefined,
        });
    }
    catch (e) {
        logger_1.logger.error("Failed to connect to redis", e);
        return null;
    }
};
exports.redis = trackRedisInstance(globalThis.redis ?? createRedisClient());
if (env_1.env.NODE_ENV !== "production")
    globalThis.redis = exports.redis;
