ARG ML_BASE_IMAGE=openscience/python-ml-cpu:py312-torch2.11.0-cpu
FROM ${ML_BASE_IMAGE}

ENV DEBIAN_FRONTEND=noninteractive \
    HF_HUB_DISABLE_TELEMETRY=1 \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    OMP_NUM_THREADS=4 \
    MKL_NUM_THREADS=4 \
    OPENBLAS_NUM_THREADS=4 \
    NUMEXPR_NUM_THREADS=4 \
    TOKENIZERS_PARALLELISM=false \
    XDG_CACHE_HOME=/tmp/cache \
    HOME=/tmp/home

RUN apt-get update \
    && apt-get install -y --no-install-recommends libsndfile1 sox libsox-fmt-all \
    && rm -rf /var/lib/apt/lists/*

COPY infra/tts-audition/requirements.txt /tmp/requirements.txt

RUN python -m pip install --no-cache-dir --timeout 600 --retries 3 --requirement /tmp/requirements.txt \
    && python -m pip check \
    && python -c "import torch; from qwen_tts import Qwen3TTSModel; assert torch.__version__ == '2.11.0+cpu'; assert torch.version.cuda is None; assert Qwen3TTSModel" \
    && install -d -m 0755 /app /opt/tts-lock /models /output \
    && python -m pip freeze --all | LC_ALL=C sort > /opt/tts-lock/package-freeze.txt \
    && chmod 0444 /opt/tts-lock/package-freeze.txt \
    && rm -f /tmp/requirements.txt

COPY infra/tts-audition/audition.py /app/audition.py

RUN groupadd --gid 10001 tts \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin tts \
    && chmod 0555 /app/audition.py \
    && chown 10001:10001 /output

USER 10001:10001
ENTRYPOINT ["python", "/app/audition.py"]

