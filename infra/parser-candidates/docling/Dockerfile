FROM python:3.12-slim

ENV DEBIAN_FRONTEND=noninteractive \
    HF_HUB_DISABLE_TELEMETRY=1 \
    OMP_NUM_THREADS=2 \
    MKL_NUM_THREADS=2 \
    OPENBLAS_NUM_THREADS=2 \
    NUMEXPR_NUM_THREADS=2 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    XDG_CACHE_HOME=/tmp/cache \
    HOME=/tmp/home

ADD --checksum=sha256:95c0a4d9bc1beafc6097c8573ec3a8dc317e8bcf67e3234aa7c050b7d73fde9c \
    https://files.pythonhosted.org/packages/32/4b/cdea48e4e914d246ece99f1bf97b3f983f4db91ec355024d50657cf587f1/docling-2.123.0-py3-none-any.whl \
    /tmp/docling-2.123.0-py3-none-any.whl

RUN python -m pip install --no-cache-dir --timeout 120 --retries 5 \
      --index-url https://download.pytorch.org/whl/cpu \
      'torch==2.13.0+cpu' 'torchvision==0.28.0+cpu' \
    && python -c "import importlib.metadata as m, torch; names=[d.metadata['Name'].lower() for d in m.distributions() if d.metadata.get('Name')]; assert torch.version.cuda is None; assert not any(n.startswith(('cuda-', 'nvidia-', 'rocm', 'triton')) for n in names)"

RUN python -m pip install --no-cache-dir --timeout 120 --retries 5 \
      --index-url https://pypi.org/simple --only-binary=:all: \
      'scipy==1.18.1'

RUN python -m pip install --no-cache-dir --timeout 120 --retries 5 \
      --index-url https://pypi.org/simple --only-binary=:all: \
      'opencv-python==5.0.0.93'

RUN python -m pip install --no-cache-dir --timeout 120 --retries 5 \
      --index-url https://pypi.org/simple --only-binary=:all: \
      'rapidocr==3.9.2'

RUN python -m pip install --no-cache-dir --timeout 120 --retries 5 \
      --index-url https://pypi.org/simple \
      /tmp/docling-2.123.0-py3-none-any.whl \
    && python -c "from importlib.metadata import version; assert version('docling') == '2.123.0'" \
    && python -c "import importlib.metadata as m, torch; names=[d.metadata['Name'].lower() for d in m.distributions() if d.metadata.get('Name')]; assert torch.version.cuda is None; assert not any(n.startswith(('cuda-', 'nvidia-', 'rocm', 'triton')) for n in names)" \
    && docling-tools models download --output-dir /opt/docling-models \
    && install -d -m 0755 /opt/docling-lock /app \
    && python -m pip freeze --all | LC_ALL=C sort > /opt/docling-lock/package-freeze.txt \
    && cd /opt/docling-models \
    && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum > /opt/docling-lock/model-sha256.txt \
    && test -s /opt/docling-lock/model-sha256.txt \
    && chmod -R a-w /opt/docling-models /opt/docling-lock

ENV HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1

COPY --chmod=0555 infra/parser-candidates/docling/runner.py /app/runner.py

RUN groupadd --gid 10001 candidate \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin candidate

USER 10001:10001
ENTRYPOINT ["python", "/app/runner.py"]
