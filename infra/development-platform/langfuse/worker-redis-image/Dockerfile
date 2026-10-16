FROM langfuse/langfuse-worker:4.35.0@sha256:5e35e625a214dd868bb22adad90fc52e8f83cc856c3750e47f9a922622c207fb
COPY instrumentation.js /app/worker/dist/instrumentation.js
COPY shutdown.js /app/worker/dist/utils/shutdown.js
COPY redis.js /app/worker/node_modules/.pnpm/@langfuse+shared@file++++app+packages+shared/node_modules/@langfuse/shared/dist/src/server/redis/redis.js
