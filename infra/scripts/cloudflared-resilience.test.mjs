import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const bash = process.platform === "win32"
  ? "C:/Program Files/Git/bin/bash.exe"
  : "bash";
const watchdog = path.join(root, "infra/scripts/cloudflared-watchdog.sh").replaceAll("\\", "/");

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
  const probe = `source '${watchdog}'; curl() { return 1; }; value="$(read_ha_connections)"; [[ "$value" == "0" ]]`;
  const result = spawnSync(bash, ["-c", probe], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

async function runWatchdog(t, { ha, publicStatus, originStatus, publicUrl, originResolve }) {
  const temporaryRoot = path.join(root, "tmp");
  await mkdir(temporaryRoot, { recursive: true });
  const sandbox = await mkdtemp(path.join(temporaryRoot, "cloudflared-resilience-"));
  const stateFile = path.join(sandbox, "last-restart");
  const eventsFile = path.join(sandbox, "events");
  const curlArgsFile = path.join(sandbox, "curl-args");
  t.after(async () => {
    for (const file of [stateFile, `${stateFile}.lock`, eventsFile, curlArgsFile]) {
      await rm(file, { force: true });
    }
    await rmdir(sandbox);
  });
  await writeFile(eventsFile, "");
  await writeFile(curlArgsFile, "");
  const probe = `
    source "$WATCHDOG_SCRIPT"
    restarted=0
    flock() { return 0; }
    date() { printf '2000000\\n'; }
    sleep() { return 0; }
    read_ha_connections() {
      if (( restarted )); then printf '4\\n'; else printf '%s\\n' "$TEST_HA"; fi
    }
    read_public_status() {
      if (( restarted )); then printf '200\\n'; else printf '%s\\n' "$TEST_PUBLIC"; fi
    }
    curl() {
      printf 'origin_probe\\n' >> "$EVENTS_FILE"
      printf '%s\\n' "$@" >> "$CURL_ARGS_FILE"
      printf '%s' "$TEST_ORIGIN"
    }
    log_status() { printf 'log: %s\\n' "$*" >> "$EVENTS_FILE"; }
    systemctl() {
      [[ "$*" == 'restart cloudflared' ]] || return 99
      printf 'restart\\n' >> "$EVENTS_FILE"
      restarted=1
    }
    main
  `;
  const result = spawnSync(bash, ["-c", probe], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      WATCHDOG_SCRIPT: watchdog,
      STATE_FILE: stateFile.replaceAll("\\", "/"),
      EVENTS_FILE: eventsFile.replaceAll("\\", "/"),
      CURL_ARGS_FILE: curlArgsFile.replaceAll("\\", "/"),
      PUBLIC_URL: publicUrl ?? "https://openscience.428312321.xyz/",
      ORIGIN_RESOLVE: originResolve ?? "openscience.428312321.xyz:443:127.0.0.1",
      MIN_HA_CONNECTIONS: "3",
      RESTART_COOLDOWN_SECONDS: "180",
      TEST_HA: String(ha),
      TEST_PUBLIC: publicStatus,
      TEST_ORIGIN: originStatus,
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const state = await readFile(stateFile, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  return {
    events: await readFile(eventsFile, "utf8"),
    curlArgs: (await readFile(curlArgsFile, "utf8")).trim().split("\n"),
    state,
  };
}

test("watchdog leaves a healthy tunnel running when the origin returns 502", async (t) => {
  const result = await runWatchdog(t, { ha: 4, publicStatus: "502", originStatus: "502" });

  assert.doesNotMatch(result.events, /^restart$/m);
  assert.match(result.events, /origin.*ha_connections=4.*public_http=502.*origin_http=502/);
  assert.equal(result.events.match(/^origin_probe$/gm)?.length, 1);
  assert.equal(result.state, "", "origin failure must not consume the restart cooldown");
});

test("watchdog restarts a healthy-HA tunnel when only the public path returns 502", async (t) => {
  const result = await runWatchdog(t, { ha: 4, publicStatus: "502", originStatus: "200" });

  assert.equal(result.events.match(/^restart$/gm)?.length, 1);
  assert.equal(result.events.match(/^origin_probe$/gm)?.length, 1);
  assert.equal(result.state, "2000000\n");
  assert.match(result.events, /post_restart: ha_connections=4 public_http=200/);
});

test("watchdog recovers a disconnected tunnel even when the origin is also failing", async (t) => {
  const result = await runWatchdog(t, { ha: 0, publicStatus: "502", originStatus: "502" });

  assert.equal(result.events.match(/^restart$/gm)?.length, 1);
  assert.doesNotMatch(result.events, /^origin_probe$/m);
  assert.equal(result.state, "2000000\n");
});

test("watchdog probes the same HTTPS origin without a proxy or disabled TLS verification", async (t) => {
  const result = await runWatchdog(t, {
    ha: 4,
    publicStatus: "502",
    originStatus: "200",
    publicUrl: "https://research.example/status?watchdog=1",
    originResolve: "research.example:443:127.0.0.1",
  });

  assert.equal(result.curlArgs.at(-1), "https://research.example/status?watchdog=1");
  assert.equal(result.curlArgs[result.curlArgs.indexOf("--noproxy") + 1], "*");
  assert.equal(result.curlArgs[result.curlArgs.indexOf("--resolve") + 1], "research.example:443:127.0.0.1");
  assert.equal(result.curlArgs[result.curlArgs.indexOf("--max-time") + 1], "12");
  assert.ok(!result.curlArgs.includes("-k") && !result.curlArgs.includes("--insecure"));
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
