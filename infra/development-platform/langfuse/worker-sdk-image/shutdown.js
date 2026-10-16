"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.drainAndClose = exports.onShutdown = void 0;
const server_1 = require("@langfuse/shared/src/server");
const server_2 = require("@langfuse/shared/src/server");
const ClickhouseWriter_1 = require("../services/ClickhouseWriter");
const health_1 = require("../features/health");
const index_1 = require("../index");
const usage_1 = require("../features/tokenisation/usage");
const async_usage_1 = require("../features/tokenisation/async-usage");
const workerManager_1 = require("../queues/workerManager");
const inFlightExports_1 = require("../features/blobstorage/inFlightExports");
const executeInAppAgentRun_1 = require("../features/in-app-agent/executeInAppAgentRun");
const db_1 = require("@langfuse/shared/src/db");
const backgroundMigrationManager_1 = require("../backgroundMigrations/backgroundMigrationManager");
const app_1 = require("../app");
const instrumentation_1 = require("../instrumentation");
const onShutdown = async (signal) => {
    server_1.logger.info(`Received ${signal}, closing server...`);
    await (0, exports.drainAndClose)();
};
exports.onShutdown = onShutdown;
let drainPromise = null;
// Flip readiness to unhealthy, stop accepting new work, drain in-flight jobs
// and flush pending writes, then close connections. Shared by the
// SIGTERM/SIGINT path and the fatal-error path; memoized so concurrent
// triggers reuse one drain instead of closing workers/connections twice.
const drainAndClose = () => {
    if (!drainPromise) {
        drainPromise = runDrainAndClose();
    }
    return drainPromise;
};
exports.drainAndClose = drainAndClose;
const runDrainAndClose = async () => {
    (0, health_1.setSigtermReceived)();
    index_1.server?.close();
    server_1.logger.info("Server has been closed.");
    // Stop batch project cleaners
    for (const cleaner of app_1.batchProjectCleaners) {
        cleaner.stop();
    }
    // Stop batch data retention cleaners
    for (const cleaner of app_1.batchDataRetentionCleaners) {
        cleaner.stop();
    }
    // Stop media retention cleaner
    app_1.mediaRetentionCleaner?.stop();
    // Stop batch project media cleaner
    app_1.batchProjectMediaCleaner?.stop();
    // Stop batch project blob cleaner
    app_1.batchProjectBlobCleaner?.stop();
    // Stop batch trace deletion cleaner
    app_1.batchTraceDeletionCleaner?.stop();
    // Stop durable trace-delete batch action runner
    app_1.traceDeleteBatchActionRunner?.stop();
    app_1.inAppAgentIntegrityRunner?.stop();
    // Stop deleted-mask cleaner
    app_1.deletedMaskCleaner?.stop();
    // Stop queue metrics runner
    app_1.queueMetricsRunner?.stop();
    // Stop monitor runners
    for (const runner of app_1.monitorRunners) {
        runner.stop();
    }
    app_1.inAppAgentDlqRetryRunner?.stop();
    // Before closeWorkers(), while the registry is still populated (LFE-10388).
    (0, inFlightExports_1.logInFlightBlobExportsOnShutdown)();
    // Abort in-flight agent loops at their next step boundary so closeWorkers()
    // does not wait out a full agent turn; each run finishes FAILED
    // (worker_shutdown) with its events flushed.
    (0, executeInAppAgentRun_1.abortActiveInAppAgentRuns)();
    // Shutdown workers (https://docs.bullmq.io/guide/going-to-production#gracefully-shut-down-workers)
    await workerManager_1.WorkerManager.closeWorkers();
    // Shutdown background migrations
    await backgroundMigrationManager_1.BackgroundMigrationManager.close();
    // Flush all pending writes to Clickhouse AFTER closing ingestion queue worker that is writing to it
    await ClickhouseWriter_1.ClickhouseWriter.getInstance().shutdown();
    server_1.logger.info("Clickhouse writer has been shut down.");
    server_2.redis?.disconnect();
    server_1.logger.info("Redis connection has been closed.");
    await db_1.prisma.$disconnect();
    server_1.logger.info("Prisma connection has been closed.");
    // Shutdown clickhouse connections
    await server_1.ClickHouseClientManager.getInstance().closeAllConnections();
    // Shutdown tokenization worker threads
    try {
        await (0, async_usage_1.getTokenCountWorkerManager)().terminate();
        server_1.logger.info("Token count worker threads have been terminated.");
    }
    catch (error) {
        server_1.logger.error("Error terminating token count worker threads", error);
    }
    (0, usage_1.freeAllTokenizers)();
    server_1.logger.info("All tokenizers are cleaned up from memory.");
    await (0, instrumentation_1.shutdownInstrumentation)();
    server_1.logger.info("Shutdown complete, exiting process...");
};
