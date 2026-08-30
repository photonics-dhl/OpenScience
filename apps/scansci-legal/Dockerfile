FROM python:3.12-slim@sha256:7a8b475003c4fe15a2cd4e55e5cfc2f3560bdc9333d624f24cdd6d4340fd7a17 AS python-dependencies

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1
WORKDIR /requirements
RUN python -m venv /opt/scansci-venv
COPY build-requirements.lock requirements.lock ./
RUN /opt/scansci-venv/bin/python -m pip install --require-hashes -r build-requirements.lock \
    && /opt/scansci-venv/bin/python -m pip install --require-hashes --no-build-isolation -r requirements.lock

FROM python:3.12-slim@sha256:7a8b475003c4fe15a2cd4e55e5cfc2f3560bdc9333d624f24cdd6d4340fd7a17

ENV PATH=/opt/scansci-venv/bin:$PATH \
    PYTHONPATH=/opt/scansci/src \
    PYTHONNOUSERSITE=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOME=/session/home \
    SCANSCI_PDF_DATA_DIR=/session/scansci \
    SCANSCI_RUNTIME_DIR=/tmp/scansci-legal

RUN groupadd --gid 10001 scansci \
    && useradd --uid 10001 --gid 10001 --home-dir /session/home --no-create-home --shell /usr/sbin/nologin scansci \
    && install -d -o 10001 -g 10001 -m 0700 /session /session/home /session/scansci /tmp/scansci-legal
COPY --from=python-dependencies /opt/scansci-venv /opt/scansci-venv
COPY --chown=10001:10001 src /opt/scansci/src

VOLUME ["/session"]
USER 10001:10001
ENTRYPOINT ["python", "-m", "scansci_legal.main"]
