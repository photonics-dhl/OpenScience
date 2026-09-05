ARG BROWSER_IMAGE=openscience-scansci-mcp:390afc09d3b6ec64d5b23e64f6bffe6bf8a375e7
FROM ${BROWSER_IMAGE} AS browser-source
FROM node:22-bookworm
# Reuse the browser already present on this ECS. No browser download/installation.
# The complete bundle (including locales, ICU and graphics libraries) is required.
COPY --from=browser-source /opt/scansci-browsers/chromium_headless_shell-1234/chrome-headless-shell-linux64/ /opt/media-browser/
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg fonts-noto-cjk fonts-liberation ca-certificates \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcairo2 libcups2 \
    libcurl4 libdbus-1-3 libexpat1 libgbm1 libglib2.0-0 libgtk-3-0 libnspr4 \
    libnss3 libpango-1.0-0 libudev1 libvulkan1 libx11-6 libxcb1 libxcomposite1 \
    libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2
WORKDIR /opt/renderer
# playwright-core 1.62.1 matches the reused browser revision 1234 / Chrome 151.
RUN npm install --ignore-scripts --no-package-lock --no-audit --no-fund playwright-core@1.62.1
COPY apps/media-demo/*.mjs ./
LABEL openscience.browser-source="scansci-390afc0" openscience.browser-version="151.0.7922.34"
ENV SCIENCE_CHROMIUM=/opt/media-browser/chrome-headless-shell SCIENCE_FFMPEG=/usr/bin/ffmpeg SCIENCE_FFPROBE=/usr/bin/ffprobe HOME=/tmp
USER 1000:1000
ENTRYPOINT ["node", "/opt/renderer/render.mjs"]
