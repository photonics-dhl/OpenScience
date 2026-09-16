# syntax=docker/dockerfile:1
FROM node:22-bookworm AS dependencies
WORKDIR /app

# Reuse the cached full Node buildpack image's Python/C++ toolchain for SQLite.
# Only the installed packages enter the slim runtime stage below.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
RUN npx --yes pnpm@9.15.0 install --frozen-lockfile --prod

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json pnpm-workspace.yaml backend.mjs query.mjs app-config.yaml catalog-info.yaml ./
USER 1000:1000
EXPOSE 3131
CMD ["node", "--no-node-snapshot", "backend.mjs", "--config", "app-config.yaml"]
