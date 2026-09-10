ARG BROWSER_IMAGE=openscience-scansci-mcp:7f8e47d931b751cc28c1000325128c2ca86566cb
FROM node:22-bookworm AS node-source
FROM openscience-media-demo:b361f4f7781b760583b3a312829877c4d6310e8a AS font-source
FROM ${BROWSER_IMAGE}
USER root
# Reuse the server's full Chrome, Xvfb and graphics libraries. No browser download.
COPY --from=node-source /usr/local/bin/node /usr/local/bin/node
COPY --from=font-source /usr/share/fonts/ /usr/share/fonts/
RUN sed -i 's|http://deb.debian.org/debian|http://mirrors.aliyun.com/debian|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update && apt-get install -y --no-install-recommends x11vnc novnc websockify \
    && useradd --uid 11040 --user-group --create-home browser
COPY --from=font-source /opt/renderer/node_modules/playwright-core/ /app/node_modules/playwright-core/
COPY start.sh relay.mjs runner.cjs /app/
USER 11040:11040
ENV HOME=/profile DISPLAY=:99
ENTRYPOINT ["/bin/bash", "/app/start.sh"]
