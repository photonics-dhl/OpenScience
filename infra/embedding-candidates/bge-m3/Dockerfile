FROM python:3.12-slim

ENV DEBIAN_FRONTEND=noninteractive \
    HF_HUB_DISABLE_TELEMETRY=1 \
    HF_HUB_DISABLE_XET=1 \
    OMP_NUM_THREADS=2 \
    MKL_NUM_THREADS=2 \
    OPENBLAS_NUM_THREADS=2 \
    NUMEXPR_NUM_THREADS=2 \
    TOKENIZERS_PARALLELISM=false \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    XDG_CACHE_HOME=/tmp/cache \
    HOME=/tmp/home

ADD --checksum=sha256:35e33a08e8ed5e299eabbe3bc23518eb66a424dd29ee08fb3802bf9aef9e9bf2 \
    https://files.pythonhosted.org/packages/6e/4a/eb1a033d744e5a854f0918b2a002fca0d7db72078aa70b5145d5100141c1/flagembedding-1.4.2-py3-none-any.whl \
    /tmp/flagembedding-1.4.2-py3-none-any.whl

RUN python -m pip install --no-cache-dir --timeout 600 --retries 5 \
      --index-url https://download.pytorch.org/whl/cpu \
      'torch==2.13.0+cpu' \
    && python -c "import importlib.metadata as m, torch; names=[d.metadata['Name'].lower() for d in m.distributions() if d.metadata.get('Name')]; assert torch.version.cuda is None; assert not any(n.startswith(('cuda-', 'nvidia-', 'rocm', 'triton')) for n in names)"

RUN python -m pip install --no-cache-dir --timeout 600 --retries 5 \
      --index-url https://pypi.org/simple \
      /tmp/flagembedding-1.4.2-py3-none-any.whl \
    && python -c "from importlib.metadata import version; assert version('FlagEmbedding') == '1.4.2'" \
    && python -c "import importlib.metadata as m, torch; names=[d.metadata['Name'].lower() for d in m.distributions() if d.metadata.get('Name')]; assert torch.version.cuda is None; assert not any(n.startswith(('cuda-', 'nvidia-', 'rocm', 'triton')) for n in names)"

RUN install -d -m 0755 /opt/bge-m3-model /opt/bge-m3-lock /app \
    && python -c "from huggingface_hub import snapshot_download; snapshot_download(repo_id='BAAI/bge-m3', revision='5617a9f61b028005a4858fdac845db406aefb181', local_dir='/opt/bge-m3-model')" \
    && python -m pip freeze --all | LC_ALL=C sort > /opt/bge-m3-lock/package-freeze.txt \
    && cd /opt/bge-m3-model \
    && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum > /opt/bge-m3-lock/model-sha256.txt \
    && test -s /opt/bge-m3-lock/model-sha256.txt \
    && chmod -R a-w /opt/bge-m3-model /opt/bge-m3-lock

ENV HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1

COPY --chmod=0555 infra/embedding-candidates/bge-m3/runner.py /app/runner.py

RUN groupadd --gid 10001 candidate \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin candidate

USER 10001:10001
ENTRYPOINT ["python", "/app/runner.py"]
