# syntax=docker/dockerfile:1.7

FROM python:3.12-slim@sha256:7a8b475003c4fe15a2cd4e55e5cfc2f3560bdc9333d624f24cdd6d4340fd7a17 AS runtime

ARG SCANSCI_VERSION=1.13.1
ARG SCANSCI_WHEEL_SHA256=f68c30503834fc093eb192bd556090d210241eed48445017fdb3d32f6e1355e5

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONNOUSERSITE=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/opt/scansci-browsers \
    SCANSCI_PDF_DATA_DIR=/data/scansci \
    HOME=/data/scansci/home \
    DISPLAY=:99

WORKDIR /opt/scansci
COPY requirements.lock /opt/scansci/requirements.lock
RUN --mount=type=cache,target=/root/.cache/pip \
    python -m venv /opt/scansci-venv \
    && installed=0 \
    && for attempt in 1 2 3 4 5; do \
         if PIP_NO_CACHE_DIR=0 /opt/scansci-venv/bin/python -m pip install --require-hashes --only-binary=scansci-pdf -r /opt/scansci/requirements.lock; then installed=1; break; fi; \
         sleep "$attempt"; \
       done \
    && test "$installed" = 1 \
    && /opt/scansci-venv/bin/python -m patchright install --with-deps chromium \
    && apt-get update \
    && apt-get install -y --no-install-recommends dumb-init tor xvfb xauth \
    && rm -rf /var/lib/apt/lists/* /root/.cache/pip \
    && /opt/scansci-venv/bin/python -c "import importlib.metadata; assert importlib.metadata.version('scansci-pdf') == '${SCANSCI_VERSION}'; assert '${SCANSCI_WHEEL_SHA256}' == 'f68c30503834fc093eb192bd556090d210241eed48445017fdb3d32f6e1355e5'"

ENV PATH=/opt/scansci-venv/bin:$PATH
RUN groupadd --gid 10001 scansci \
    && groupadd --gid 11000 scansci-share \
    && useradd --uid 10001 --gid 10001 --groups 11000 --home-dir /data/scansci/home --no-create-home --shell /usr/sbin/nologin scansci \
    && install -d -o 10001 -g 10001 -m 0700 /data/scansci /data/scansci/home /data/scansci/tor /tmp/scansci-runtime \
    && install -d -o 10001 -g 11000 -m 0770 /data/papers \
    && chown -R 10001:10001 /opt/scansci-browsers

FROM runtime AS mcp

RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx-light \
    && rm -rf /var/lib/apt/lists/*
COPY --chown=10001:10001 entrypoint.sh /opt/scansci/entrypoint.sh
COPY --chown=10001:10001 healthcheck.py /opt/scansci/healthcheck.py
COPY --chown=10001:10001 nginx-mcp.conf /opt/scansci/nginx-mcp.conf
RUN chmod 0555 /opt/scansci/entrypoint.sh

ARG XGS_RELEASE_IMAGE_TAG
LABEL org.openscience.source=$XGS_RELEASE_IMAGE_TAG \
      org.openscience.scansci.role=official-mcp \
      org.openscience.scansci.version=$SCANSCI_VERSION \
      org.openscience.scansci.wheel-sha256=$SCANSCI_WHEEL_SHA256

VOLUME ["/data/scansci", "/data/papers"]
EXPOSE 8000
USER 10001:10001
ENTRYPOINT ["/usr/bin/dumb-init", "--", "/opt/scansci/entrypoint.sh"]
