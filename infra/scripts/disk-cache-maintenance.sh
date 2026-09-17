#!/bin/bash
# disk-cache-maintenance.sh — recurring reclamation of REGENERABLE caches only.
#
# Scope decision (2026-09-17): this script deliberately does NOT reclaim
# historical release directories. project_index.md records that
# production-release-retention.mjs "绑定发布事务并保护开发工具挂载，不作独立清理入口",
# and AGENTS.md forbids stacking new gates/task libraries. Historical release
# cleanup therefore stays a user-authorized operation with scope and receipts
# recorded in CURRENT (procedure: docs/runbooks/deployment.md).
#
# What this reclaims is only data that rebuilds itself:
#   - docker build cache      (next build is slower once; nothing is lost)
#   - dangling images         (untagged, unreferenced)
#   - systemd journal above the configured cap
#
# It never touches containers, tagged images, volumes, database backups,
# release directories, or the live application. Deploys are unaffected: the
# script holds no deploy lock and takes no lock the deploy needs.
set -uo pipefail

log() { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"; }

before_avail=$(df -B1 --output=avail / | tail -1 | tr -d ' ')
log "=== start (avail=$(numfmt --to=iec "$before_avail" 2>/dev/null || echo "$before_avail")) ==="

if docker builder prune -af >/dev/null 2>&1; then log "build cache pruned"; else log "build cache prune skipped"; fi
if docker image prune -f >/dev/null 2>&1; then log "dangling images pruned"; else log "dangling image prune skipped"; fi
if journalctl --vacuum-size=500M >/dev/null 2>&1; then log "journal vacuumed"; else log "journal vacuum skipped"; fi

# Visibility for the one thing this script must not reclaim. Historical
# releases are only reclaimed by an authorized operation, so surface growth
# instead of silently ignoring it.
releases=$(ls -1 /opt/openscience-releases 2>/dev/null | grep -cE '^[a-f0-9]{40}$')
if [ -d /opt/openscience-releases ]; then
  size=$(du -shx /opt/openscience-releases 2>/dev/null | cut -f1)
else
  size=absent
fi
log "historical releases: count=$releases size=$size (reclaimed only by an authorized cleanup)"

after_avail=$(df -B1 --output=avail / | tail -1 | tr -d ' ')
log "=== done freed=$(( (after_avail - before_avail) / 1048576 ))MiB ==="
df -h / | tail -1 | while read -r line; do log "disk: $line"; done
