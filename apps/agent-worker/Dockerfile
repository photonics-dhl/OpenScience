FROM node:22-bookworm

ARG XGS_RELEASE_IMAGE_TAG
LABEL org.openscience.source=$XGS_RELEASE_IMAGE_TAG

RUN mkdir -p /parser-jobs \
  && chown node:node /parser-jobs

WORKDIR /opt/openscience/apps/agent-worker
CMD ["node", "dist/index.js"]
