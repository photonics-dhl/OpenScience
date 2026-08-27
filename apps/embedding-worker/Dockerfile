FROM python:3.12-slim@sha256:7a8b475003c4fe15a2cd4e55e5cfc2f3560bdc9333d624f24cdd6d4340fd7a17

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

COPY apps/embedding-worker/requirements.lock /tmp/requirements.lock

RUN python -m pip install --no-cache-dir --timeout 600 --retries 5 \
      --requirement /tmp/requirements.lock \
    && python -c "from importlib.metadata import version; assert version('FlagEmbedding') == '1.4.2'" \
    && python -c "import importlib.metadata as m, torch; names=[d.metadata['Name'].lower() for d in m.distributions() if d.metadata.get('Name')]; assert torch.version.cuda is None; assert not any(n.startswith(('cuda-', 'nvidia-', 'rocm', 'triton')) for n in names)" \
    && rm -f /tmp/flagembedding-1.4.2-py3-none-any.whl /tmp/requirements.lock

RUN install -d -m 0755 /app /opt/bge-m3-seed /opt/bge-m3-lock /models/bge-m3

COPY apps/embedding-worker/app.py /app/app.py
COPY apps/embedding-worker/model-init.py /app/model-init.py
COPY apps/embedding-worker/requirements.lock /opt/bge-m3-lock/requirements.lock

RUN chmod 0555 /app/app.py /app/model-init.py \
    && chmod 0444 /opt/bge-m3-lock/requirements.lock \
    && python /app/app.py --print-source-sha256 > /opt/bge-m3-lock/source-sha256.txt \
    && chmod 0444 /opt/bge-m3-lock/source-sha256.txt

RUN python -c "from huggingface_hub import snapshot_download; snapshot_download(repo_id='BAAI/bge-m3', revision='5617a9f61b028005a4858fdac845db406aefb181', local_dir='/opt/bge-m3-seed')" \
    && python /app/model-init.py --write-manifest --seed /opt/bge-m3-seed \
    && python /app/model-init.py --validate --target /opt/bge-m3-seed \
    && python -m pip freeze --all | LC_ALL=C sort > /opt/bge-m3-lock/package-freeze.txt \
    && chmod -R a-w /opt/bge-m3-seed /opt/bge-m3-lock

RUN groupadd --gid 10001 embedding \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin embedding \
    && chown 10001:10001 /models/bge-m3

ENV HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1

USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["python", "/app/app.py"]
