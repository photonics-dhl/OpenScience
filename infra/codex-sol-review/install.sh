#!/usr/bin/env bash
# Install the isolated Sol image-review runner from one immutable application release.
# CLI installation and account login are separate operator actions.
set -euo pipefail
[[ "${1:-}" = '--confirm' && "${2:-}" = '--source' && $# = 3 ]] || { echo 'Usage: install.sh --confirm --source /opt/openscience-releases/<sha>'; exit 64; }
source_root="$(readlink -f -- "$3")"
sha="$(basename -- "$source_root")"
[[ "$sha" =~ ^[a-f0-9]{40}$ && "$source_root" = "/opt/openscience-releases/$sha" ]] || exit 65
[[ "$(id -u)" = 0 ]] || exit 66
node "$source_root/scripts/release-input-manifest.mjs" verify --root "$source_root" --sha "$sha"
root=/opt/openscience-codex-review
runtime="$root/runtime"
auth="$root/state/auth.json"
node_image=sha256:9aa184189f478192a37d9f5e318aef6bb25690db294b0857c3ea798d76b1bbc7
[[ -f "$runtime/node_modules/@openai/codex/bin/codex.js" && ! -L "$runtime" ]] || { echo 'CODEX_REVIEW_RUNTIME_MISSING'; exit 67; }
[[ -f "$auth" && ! -L "$auth" && "$(stat -c '%u %a' "$auth")" = '1000 600' ]] || { echo 'CODEX_REVIEW_LOGIN_MISSING'; exit 67; }
[[ -d "$root/state" && ! -L "$root/state" && "$(stat -c '%u %a' "$root/state")" = '1000 700' ]] || { echo 'CODEX_REVIEW_STATE_UNSAFE'; exit 67; }
docker image inspect "$node_image" >/dev/null
for path in "$root" "$root/releases" "$root/inbox" "$root/results" "$root/private" "$root/state"; do [[ ! -L "$path" ]] || exit 68; done
install -d -m 0755 "$root" "$root/releases"
install -d -o root -g 11000 -m 2770 "$root/inbox"
install -d -o root -g 11000 -m 2750 "$root/results"
install -d -o root -g root -m 0700 "$root/private"
bundle="$root/releases/$sha"
[[ ! -e "$bundle" ]] || { echo 'Review bundle already exists; inspect before reusing'; exit 69; }
install -d -m 0755 "$bundle/infra/codex-sol-review" "$bundle/infra/codex-image-runner" "$bundle/packages/ai-gateway/dist"
for file in runner.mjs review-client.mjs; do install -m 0444 "$source_root/infra/codex-sol-review/$file" "$bundle/infra/codex-sol-review/$file"; done
install -m 0444 "$source_root/infra/codex-image-runner/proxy.mjs" "$bundle/infra/codex-image-runner/proxy.mjs"
find "$source_root/packages/ai-gateway/dist" -maxdepth 1 -type f -name '*.js' -exec install -m 0444 -t "$bundle/packages/ai-gateway/dist" {} +
node --input-type=module - "$bundle/infra/codex-sol-review/runner.mjs" <<'NODE'
import { pathToFileURL } from 'node:url';
const runner=await import(pathToFileURL(process.argv[2]).href);
if(typeof runner.main!=='function')throw Error('REVIEW_RUNNER_INVALID');
NODE
printf '%s\n' "$sha" > "$bundle/source-id"
config="$root/config-$sha.json"
printf '{"inbox":"%s/inbox","results":"%s/results","privateRoot":"%s/private","runtime":"%s","auth":"%s","nodeImage":"%s"}\n' \
  "$root" "$root" "$root" "$runtime" "$auth" "$node_image" > "$config"
chmod 0600 "$config"
unit=/etc/systemd/system/openscience-codex-sol-review.service
[[ ! -L "$unit" ]] || exit 68
prior_active="$(systemctl is-active openscience-codex-sol-review 2>/dev/null || true)"
prior_enabled="$(systemctl is-enabled openscience-codex-sol-review 2>/dev/null || true)"
had_unit=false
if [[ -f "$unit" ]]; then cp -p "$unit" "$root/service-before-$sha"; had_unit=true; fi
rollback_service(){
  code=$?;trap - ERR;set +e
  systemctl stop openscience-codex-sol-review
  if [[ "$had_unit" = true ]]; then
    install -m 0644 "$root/service-before-$sha" "$unit";systemctl daemon-reload
    if [[ "$prior_enabled" = enabled ]]; then systemctl enable openscience-codex-sol-review; else systemctl disable openscience-codex-sol-review; fi
    if [[ "$prior_active" = active ]]; then systemctl start openscience-codex-sol-review; fi
  else
    systemctl disable openscience-codex-sol-review
    [[ ! -f "$unit" ]] || mv "$unit" "$root/service-failed-$sha"
    systemctl daemon-reload
  fi
  echo 'CODEX_SOL_REVIEW_INSTALL_FAILED; prior service state restoration attempted' >&2
  exit "$code"
}
trap rollback_service ERR
cat > "$root/service-new-$sha" <<EOF
[Unit]
Description=OpenScience isolated GPT-5.6 Sol image review runner
After=docker.service squid.service
Requires=docker.service
[Service]
Type=simple
ExecStart=/usr/bin/flock -n $root/runner.lock /usr/bin/node $bundle/infra/codex-sol-review/runner.mjs --config $config
Restart=on-failure
RestartSec=10
TimeoutStopSec=1800
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$root
UMask=0027
[Install]
WantedBy=multi-user.target
EOF
if [[ "$had_unit" = true ]]; then systemctl stop openscience-codex-sol-review; fi
if [[ -e "$root/results/.ready" ]]; then
  [[ -f "$root/results/.ready" && ! -L "$root/results/.ready" ]] || exit 68
  mv "$root/results/.ready" "$root/ready-before-$sha"
fi
install -m 0644 "$root/service-new-$sha" "$unit"
systemctl daemon-reload
started_at="$(date +%s)"
systemctl enable --now openscience-codex-sol-review
ready=false
for (( attempt=0; attempt<40; attempt++ )); do
  if systemctl is-active --quiet openscience-codex-sol-review && [[ -f "$root/results/.ready" ]] && [[ "$(stat -c %Y "$root/results/.ready")" -ge "$started_at" ]]; then ready=true; break; fi
  sleep 0.5
done
[[ "$ready" = true ]]
trap - ERR
echo "CODEX_SOL_REVIEW_INSTALLED source=$sha"
