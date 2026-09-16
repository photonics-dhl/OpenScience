FROM node:22-bookworm
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npx --yes pnpm@9.15.0 install --prod --frozen-lockfile --ignore-scripts
COPY connector.mjs query.mjs ./
USER 1000:1000
CMD ["node", "connector.mjs"]
