FROM node:22-bookworm-slim

WORKDIR /app
COPY infra/parser-candidates/liteparse/package.json infra/parser-candidates/liteparse/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
  && test "$(node -p "require('@llamaindex/liteparse/package.json').version")" = "2.14.0"
COPY infra/parser-candidates/liteparse/runner.mjs ./runner.mjs

USER node
ENTRYPOINT ["node", "/app/runner.mjs"]
