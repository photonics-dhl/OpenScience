FROM python:3.12-slim

ENV HF_HUB_DISABLE_TELEMETRY=1 \
    OMP_NUM_THREADS=2 \
    MKL_NUM_THREADS=2 \
    OPENBLAS_NUM_THREADS=2 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PADDLE_PDX_CACHE_HOME=/opt/paddleocr-models \
    PADDLE_PDX_MODEL_SOURCE=BOS \
    HOME=/tmp/home

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

ADD --checksum=sha256:c0f0a81ad4112727f30c6fcf986ac0ef6a120d31ee0991a01fae0357ee32d338 \
    https://files.pythonhosted.org/packages/d2/79/2ade66cf72074a3d2a013e2ba1f256d6116fec797b908fc1b4f9c320d8c4/paddleocr-3.7.0-py3-none-any.whl \
    /tmp/paddleocr-3.7.0-py3-none-any.whl

RUN python -m pip install --no-cache-dir --timeout 120 --retries 5 \
      --index-url https://www.paddlepaddle.org.cn/packages/stable/cpu/ \
      'paddlepaddle==3.3.1'

RUN python -m pip install --no-cache-dir --timeout 120 --retries 5 \
      --index-url https://pypi.org/simple \
      /tmp/paddleocr-3.7.0-py3-none-any.whl \
    && python -c "from importlib.metadata import version; import paddle; assert version('paddleocr') == '3.7.0'; assert version('paddlepaddle') == '3.3.1'; assert not paddle.is_compiled_with_cuda()" \
    && python -c "from paddleocr import PaddleOCR; PaddleOCR(device='cpu', lang='ch', ocr_version='PP-OCRv5', text_detection_model_name='PP-OCRv5_mobile_det', text_recognition_model_name='PP-OCRv5_mobile_rec', use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=False)" \
    && install -d -m 0755 /opt/paddleocr-lock /app \
    && python -m pip freeze --all | LC_ALL=C sort > /opt/paddleocr-lock/package-freeze.txt \
    && cd /opt/paddleocr-models \
    && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum > /opt/paddleocr-lock/model-sha256.txt \
    && test -s /opt/paddleocr-lock/model-sha256.txt \
    && chmod -R a-w /opt/paddleocr-models /opt/paddleocr-lock

COPY --chmod=0555 infra/parser-candidates/paddleocr/runner.py /app/runner.py

RUN groupadd --gid 10001 candidate \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin candidate

USER 10001:10001
ENTRYPOINT ["python", "/app/runner.py"]
