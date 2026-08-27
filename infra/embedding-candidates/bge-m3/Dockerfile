ARG RUNTIME_IMAGE
FROM ${RUNTIME_IMAGE}

USER root
COPY infra/embedding-candidates/bge-m3/runner.py /app/runner.py
RUN chmod 0555 /app/runner.py
USER 10001:10001
ENTRYPOINT ["python", "/app/runner.py"]
