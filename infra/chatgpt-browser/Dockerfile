FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium xvfb x11vnc novnc websockify nodejs fonts-noto-cjk ca-certificates \
    && useradd --uid 11040 --user-group --create-home browser
COPY start.sh relay.mjs /app/
USER 11040:11040
ENV HOME=/profile DISPLAY=:99
ENTRYPOINT ["/bin/bash", "/app/start.sh"]
