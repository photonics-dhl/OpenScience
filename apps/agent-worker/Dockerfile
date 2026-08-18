FROM node:22-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng tesseract-ocr-chi-sim \
  && mkdir -p /parser-jobs \
  && chown node:node /parser-jobs \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/openscience/apps/agent-worker
CMD ["node", "dist/index.js"]
