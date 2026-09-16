FROM node:22-bookworm-slim AS typescript
WORKDIR /opt/typescript-runtime
COPY package.json pnpm-lock.yaml ./
RUN npx --yes pnpm@9.15.0 install --frozen-lockfile --prod --ignore-scripts

FROM python:3.12-slim AS python-dependencies
ENV UV_PYTHON_DOWNLOADS=never \
    UV_LINK_MODE=copy \
    SERENA_HOME=/opt/serena-home
COPY uv /usr/local/bin/uv
COPY serena-upstream.tar.gz /tmp/serena-upstream.tar.gz
RUN mkdir -p /opt/serena /opt/serena-home/memories/global \
    /opt/serena-home/logs /opt/serena-project/memories /opt/serena-project/cache \
    && tar -xzf /tmp/serena-upstream.tar.gz --strip-components=1 -C /opt/serena
WORKDIR /opt/serena
# Use upstream's committed uv.lock and the already-present Python interpreter.
RUN uv sync --frozen --no-dev --no-editable --python /usr/local/bin/python3.12
COPY prepare-config.py /opt/prepare-config.py
RUN /opt/serena/.venv/bin/python /opt/prepare-config.py

FROM python:3.12-slim AS runtime
# Node's shared C++ runtime is not supplied by the Python slim image.
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6
ENV PATH=/opt/serena/.venv/bin:/usr/local/bin:/usr/bin:/bin \
    SERENA_HOME=/opt/serena-home \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NODE_OPTIONS=--max-old-space-size=1024
WORKDIR /opt/serena
COPY --from=python-dependencies /opt/serena/.venv /opt/serena/.venv
COPY --from=python-dependencies /opt/serena-home /opt/serena-home
COPY --from=python-dependencies /opt/serena-project /opt/serena-project
COPY --from=typescript /usr/local/bin/node /usr/local/bin/node
COPY --from=typescript /opt/typescript-runtime /opt/serena-home/language_servers/static/TypeScriptLanguageServer/ts-lsp
COPY readonly-context.yml /opt/serena/readonly-context.yml
COPY snapshot_identity.py /opt/serena/snapshot_identity.py
COPY query.py /opt/serena/query.py
COPY serve.py /opt/serena/serve.py
# SerenaPromptFactory calls makedirs(exist_ok=True) at every startup. Keep the
# empty override directory in the image so a read-only runtime can start.
RUN mkdir -p /opt/serena-home/prompt_templates
LABEL org.opencontainers.image.source=https://github.com/oraios/serena \
      org.opencontainers.image.revision=403ad0a562bbc86ff5a0e26c23544dbd99235c15
USER 1000:1000
EXPOSE 3132
ENTRYPOINT ["/opt/serena/.venv/bin/python", "/opt/serena/serve.py"]
