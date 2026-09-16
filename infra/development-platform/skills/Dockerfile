# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS dependencies
WORKDIR /opt/skills
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
RUN npx --yes pnpm@9.15.0 install --prod --frozen-lockfile --ignore-scripts

FROM node:22-bookworm-slim
LABEL org.opencontainers.image.source="https://github.com/vercel-labs/skills" \
      org.opencontainers.image.version="1.5.26" \
      org.opencontainers.image.revision="d667282815248da03a08a18272b5d2eef9caf77c"
ENV NODE_ENV=production DO_NOT_TRACK=1 DISABLE_TELEMETRY=1
COPY --from=dependencies /opt/skills/node_modules /opt/skills/node_modules
COPY entrypoint.sh /opt/skills/entrypoint.sh
USER 1000:1000
WORKDIR /project
ENTRYPOINT ["/bin/sh", "/opt/skills/entrypoint.sh"]
CMD ["list"]
