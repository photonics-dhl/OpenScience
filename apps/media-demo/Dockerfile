FROM node:22-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends chromium ffmpeg fonts-noto-cjk ca-certificates
WORKDIR /opt/renderer
# playwright-core has no transitive dependencies. Chromium comes from Debian.
RUN npm install --ignore-scripts --no-package-lock --no-audit --no-fund playwright-core@1.62.1
COPY apps/media-demo/*.mjs ./
ENV SCIENCE_CHROMIUM=/usr/bin/chromium SCIENCE_FFMPEG=/usr/bin/ffmpeg SCIENCE_FFPROBE=/usr/bin/ffprobe HOME=/tmp
USER 1000:1000
ENTRYPOINT ["node", "/opt/renderer/render.mjs"]
