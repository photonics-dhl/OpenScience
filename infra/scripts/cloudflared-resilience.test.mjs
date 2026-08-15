import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function read(relativePath) {
  try {
    return await readFile(path.join(root, relativePath), "utf8");
  } catch {
    return "";
  }
}

test("cloudflared uses the verified HTTP2 IPv4 edge pool and publishes HA metrics", async () => {
  const unit = await read("infra/systemd/cloudflared.service");
  const edges = unit.match(/--edge 198\.41\.219\.\d+:7844/g) ?? [];

  assert.match(unit, /--protocol http2/);
  assert.match(unit, /--edge-ip-version 4/);
  assert.match(unit, /--metrics 127\.0\.0\.1:49312/);
  assert.ok(edges.length >= 4, `expected at least four verified edges, found ${edges.length}`);
  assert.doesNotMatch(unit, /--protocol auto/);
});

test("watchdog rate-limits recovery and checks both HA connections and the public page", async () => {
  const watchdog = await read("infra/scripts/cloudflared-watchdog.sh");
  const timer = await read("infra/systemd/cloudflared-watchdog.timer");

  assert.match(watchdog, /cloudflared_tunnel_ha_connections/);
  assert.match(watchdog, /https:\/\/openscience\.428312321\.xyz\//);
  assert.match(watchdog, /RESTART_COOLDOWN_SECONDS="\$\{RESTART_COOLDOWN_SECONDS:-180\}"/);
  assert.match(watchdog, /systemctl restart cloudflared/);
  assert.match(timer, /OnActiveSec=2min/);
  assert.match(timer, /OnUnitActiveSec=60s/);
  assert.doesNotMatch(timer, /OnBootSec|Persistent=true/);
});

test("watchdog emits one numeric zero when the metrics endpoint is unavailable", () => {
  const bash = process.platform === "win32"
    ? "C:/Program Files/Git/bin/bash.exe"
    : "bash";
  const watchdog = path.join(root, "infra/scripts/cloudflared-watchdog.sh").replaceAll("\\", "/");
  const probe = `source '${watchdog}'; curl() { return 1; }; value="$(read_ha_connections)"; [[ "$value" == "0" ]]`;
  const result = spawnSync(bash, ["-c", probe], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("the deployment entry point installs the versioned service and watchdog assets", async () => {
  const deploy = await read("infra/scripts/deploy-cloudflare-tunnel.ps1");

  assert.match(deploy, /infra\/systemd\/cloudflared\.service/);
  assert.match(deploy, /infra\/scripts\/cloudflared-watchdog\.sh/);
  assert.match(deploy, /cloudflared-watchdog\.timer/);
  assert.doesNotMatch(deploy, /--protocol auto/);
  assert.ok(
    deploy.indexOf("if (!$healthy)") < deploy.lastIndexOf("systemctl enable --now cloudflared-watchdog.timer"),
    "watchdog timer must only be enabled after the tunnel health gate",
  );
  assert.match(deploy, /cloudflared\.service\.pre-deploy/);
});
