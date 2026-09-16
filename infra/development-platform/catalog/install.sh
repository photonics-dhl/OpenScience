#!/usr/bin/env bash
# Server-only installation/start. No tests, probes, health polling or model calls.
set -euo pipefail
set +x
umask 077

export CATALOG_SOURCE_DIR
CATALOG_SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
export CATALOG_STATE_DIR="${CATALOG_STATE_DIR:-/opt/openscience-development/catalog/state}"
export CATALOG_SECRETS_DIR="${CATALOG_SECRETS_DIR:-/etc/openscience-development/catalog}"
export CATALOG_IMAGE_TAG="${CATALOG_IMAGE_TAG:?Set the full infrastructure Git revision}"
[[ $CATALOG_IMAGE_TAG =~ ^[a-f0-9]{40}$ ]] || { printf 'Use a full Git revision.\n' >&2; exit 64; }

if [[ "$(id -u)" != 0 ]]; then
  printf '%s\n' 'Run this installer as root on the server; it prepares persistent container storage.' >&2
  exit 1
fi

install -d -m 0750 -o 1000 -g 1000 "$CATALOG_STATE_DIR"
install -d -m 0700 -o root -g root "$CATALOG_SECRETS_DIR"
for subject in codex hermes; do
  token_file="$CATALOG_SECRETS_DIR/$subject-catalog-token"
  if [[ ! -e "$token_file" ]]; then
    openssl rand -hex 32 | tr -d '\r\n' > "$token_file"
  fi
  # Compose binds host files and cannot remap secret ownership. The parent stays
  # root-only; uid 1000 can read its individual bind mount inside the container.
  chown 1000:1000 "$token_file"
  chmod 0600 "$token_file"
done

if [[ ! -f "$CATALOG_SOURCE_DIR/pnpm-lock.yaml" ]]; then
  # First authorized server install generates the isolated pnpm lock. Retrieve
  # and commit it with this package; later image builds use the frozen lock.
  with-proxy docker run --rm --network host \
    -e HTTP_PROXY -e HTTPS_PROXY -e http_proxy -e https_proxy \
    --mount "type=bind,source=$CATALOG_SOURCE_DIR,target=/app" \
    --workdir /app node:22-bookworm-slim \
    npx --yes pnpm@9.15.0 --ignore-workspace install --lockfile-only --ignore-scripts
  chmod 0644 "$CATALOG_SOURCE_DIR/pnpm-lock.yaml"
  printf 'Dependency lock generated. Commit this file, transfer that revision, then install its image.\n'
  exit 0
fi

with-proxy docker build --pull=false --network host \
  --build-arg HTTP_PROXY --build-arg HTTPS_PROXY \
  --tag "openscience-backstage-catalog:$CATALOG_IMAGE_TAG" \
  "$CATALOG_SOURCE_DIR"
docker compose --env-file /dev/null --project-directory "$CATALOG_SOURCE_DIR" \
  --file "$CATALOG_SOURCE_DIR/compose.yaml" up --detach --no-build
printf '%s\n' 'Catalog start requested on its internal network; use ssh-run.sh --development-tunnel for localhost:3131. No runtime-read or quality claim made.'
