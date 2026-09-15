# OpenScience development Langfuse

An independent, small-volume Langfuse installation for observing existing Hermes execution. It does not run models, implement another observability UI, or replace the production application's database. Installation and existing metadata reads are recorded in [CURRENT](../../../docs/handoff/2026-09-10-hermes-web-image-handoff.md); this directory describes its configuration, not a guarantee of runtime availability or scientific quality.

## Upstream and capacity

The implementation follows the [official v4.35.0 Compose file](https://github.com/langfuse/langfuse/blob/v4.35.0/docker-compose.yml). The [latest release](https://github.com/langfuse/langfuse/releases/tag/v4.35.0) and registry manifests were read on 2026-09-14. Application code remains in upstream images.

| Service | Image | Container RAM limit |
| --- | --- | --- |
| Web | `langfuse/langfuse:4.35.0` plus pinned registry digest | 2 GiB |
| Worker | `langfuse/langfuse-worker:4.35.0` plus pinned registry digest | 1.5 GiB |
| ClickHouse | `clickhouse/clickhouse-server:25.12` plus pinned registry digest | 3 GiB |
| PostgreSQL | existing `postgres:16-alpine` image, separate instance and volume | 512 MiB |
| Redis | existing `redis:7-alpine` image, separate instance and volume | 512 MiB |
| MinIO | official Compose's `cgr.dev/chainguard/minio:latest`, pinned registry digest | 512 MiB |

Digests in `compose.yaml` prevent a moved upstream tag from changing a release or its rollback image. PostgreSQL and Redis reuse compatible server cache entries; `--pull missing` avoids replacing those cached images. Installation saves the actual image IDs in the release's `images.json`. It never upgrades existing production instances or writes their volumes. SeaweedFS is not reused: this installation needs its own S3 data and credentials.

V4 [requires ClickHouse >=25.12](https://langfuse.com/self-hosting/deployment/infrastructure/clickhouse), [PostgreSQL >=15](https://langfuse.com/self-hosting/deployment/infrastructure/postgres) and [Redis >=7 with noeviction](https://langfuse.com/self-hosting/deployment/infrastructure/cache). The pinned versions satisfy these requirements. Single-node ClickHouse uses UTC and disables cluster migrations.

The 8 GiB total is a **development-management resource ceiling**, with reduced ingestion concurrency and explicit Node heap limits. It is below the [official 16 GiB / 4-core / approximately 100 GiB VM recommendation](https://langfuse.com/self-hosting/deployment/docker-compose). The server inventory reported 19 GiB available RAM and about 80 GB free disk; these observations do not establish a sustained ingestion capacity. Start with bounded metadata imports. Do not raise caps or import full historic content to compensate for an overloaded service without reviewing server capacity.

## Access and isolation

Access uses the existing `infra/scripts/ssh-run.sh --development-tunnel`.
The client URL is `http://localhost:3130`. On this server, Docker 24 does not
publish ports for containers attached only to internal networks: the initial
port declarations were accepted but produced no mappings. The tunnel now resolves
the fixed containers' private IPs over authenticated SSH and connects directly;
no public/egress network is added. Restart the tunnel after container recreation.
The same tunnel carries Catalog 3131 and Serena MCP 3132. No host service listens
on those ports. The logged-in Langfuse UI uses its normal account authentication.

- All containers remain on Docker `internal` networks without published host ports or Internet egress. Only Web also joins `openscience-development-telemetry-ingest`, under alias `development-langfuse-web`, allowing the reviewed connector to call its API without joining Langfuse's data network. The installer refuses an existing non-internal ingestion network instead of replacing it.
- Use the project's `--development-tunnel` entry above; it resolves the target address at connection time instead of hard-coding a changing container IP.
- Telemetry, Langfuse Assistant, experiment creation and automatic evaluation consumers are disabled. No LLM provider key, code-evaluator dispatcher or Docker socket is supplied. Existing trace ingestion and human scores remain available; the integration must not create evaluator jobs.
- This initial deployment accepts text/structured event data. Media-upload storage and externally downloadable S3 exports are deliberately not configured. The private MinIO is used for Langfuse event persistence.
- The standard web image requires a domain root. [A custom base path needs a source build](https://langfuse.com/self-hosting/configuration/custom-base-path), so adding `/langfuse` under Portainer's hostname is not a runtime setting. A later unified entry should link to a dedicated hostname or the SSH entry; it must not silently introduce a source build.
- Username/password authentication is enabled; open signup is disabled. SSO, SMTP, and shared-account integration are not installed. They would need deliberate authentication and egress configuration.

## Login handoff

This is an internal model-call observability console, separate from the OpenScience research product. OpenScience passwords, ChatGPT passwords, project API keys and SSH keys are not Langfuse login credentials. `Invalid credentials` reports rejected account credentials; it does not by itself indicate an expired OpenScience session or a proxy failure.

The initial installation generated an independent owner password. On 2026-09-15, the owner explicitly requested its replacement. The existing account was updated with the upstream bcrypt cost of 12, the password was compared inside the same database transaction, and prior sessions were invalidated. The private `/etc/openscience-development/langfuse/owner-credentials.txt` was atomically synchronized with mode 0600. No password is stored in this document. The owner confirmed successful browser sign-in with the replacement password on 2026-09-15. Do not reinstall or regenerate service secrets for account handoff; a later password change may make this file stale again.

SMTP is not configured, so the displayed password-reset link is not a working recovery channel for this deployment. Credentials or identity integration need a deliberate separate account operation; normal development can use the existing restricted metadata-query helper without signing into the browser UI.

Owner login steps (run in your own PowerShell terminal, not in a chat/tool output):

1. Keep the existing development tunnel open. If it is absent, run the project `infra/scripts/ssh-run.sh --development-tunnel` through `C:/Program Files/Git/bin/bash.exe`; do not start a second tunnel when ports 3130–3132 are already in use.
2. Privately view the initial login using the existing authenticated SSH entry:

   ```powershell
   $env:XGS_CONFIG_ROOT = 'E:/Miscellaneous/XGS'
   & 'C:/Program Files/Git/bin/bash.exe' 'E:/Miscellaneous/XGS/.worktrees/onchip-video-release/infra/scripts/ssh-run.sh' 'cat /etc/openscience-development/langfuse/owner-credentials.txt'
   ```

3. Open `http://localhost:3130/auth/sign-in` and enter that file's email and password, or your newer password if you changed it after the recorded synchronization. Do not paste terminal output back into Codex.

Signing out of the UI does not stop ingestion or the restricted developer queries: they use the existing integration service keys. These steps do not reset credentials, activate SMTP or claim that a browser login has occurred.

## Server installation

Prerequisites are the already-installed Docker Engine/Compose, Bash, OpenSSL and standard Linux tools. Do not install a second Docker daemon or change production Compose projects. The root delivery task performs its independent review and authorizes execution; this package does not run CI, tests, a rehearsal, or a preflight suite.

After transferring a reviewed Git release through the project's existing server deployment transport, run on the server:

```bash
bash /path/to/reviewed-release/infra/development-platform/langfuse/install.sh \
  --confirm --release <git-commit> --owner-email <operator-email>
```

The first installation generates random secrets on the server, stores them with mode 0600 under `/etc/openscience-development/langfuse`, creates isolated resources, and starts only the `openscience-development-langfuse` Compose project. The initial Web startup applies upstream schema migrations to the new Langfuse databases. Native container health checks are startup dependencies, not a separate model/test workflow.

An optional first-install `--public-url https://dedicated-hostname` changes the authentication origin. Do not use a path or expose the port publicly. Subsequent installs retain the existing secret files and their URL; they do not silently change accounts or rotate keys. Docker runs with a clean environment against the local daemon, so inherited shell variables cannot redirect `DATABASE_URL` to another database.

| Private server file | Purpose |
| --- | --- |
| `runtime.env` | Independent database/storage credentials, encryption/authentication secrets, origin |
| `bootstrap.env` | Official headless initialization of organization `openscience-development`, project `openscience-hermes`, owner and project API key pair |
| `integration.env` | Project API key pair and `http://development-langfuse-web:3000` endpoint for the separately reviewed connector on the telemetry-ingest network |
| `owner-credentials.txt` | Operator login, synchronized after the explicitly requested 2026-09-15 password change; later changes can make it stale |

Do not print these files, dump the composed configuration, paste keys into a chat, or commit generated files. Project [headless initialization](https://langfuse.com/self-hosting/administration/headless-initialization) creates missing resources; an existing owner/password is not replaced. A human administrator can sign in with the provided account, change their password, and invite/manage users. The API keys are for the integration, not the owner's login. Retire bootstrap credentials through a separately reviewed server change after account handoff; repeated bootstrapping should not become account management.

Successful startup creates `/opt/openscience-development/langfuse/current`, pointing to the installed release. Startup output is in a private log under `logs/`; it contains no script-printed secret values. A failed first startup retains the exact release and all data. Resume it without regenerating credentials:

```bash
bash /opt/openscience-development/langfuse/releases/<git-commit>/manage.sh start --confirm
```

`start` uses only already-present images. If an initial pull was interrupted, finish the missing image acquisition through the reviewed installation procedure before resuming; it does not silently switch versions.

## Operations and persistence

```bash
bash /opt/openscience-development/langfuse/current/manage.sh status
bash /opt/openscience-development/langfuse/current/manage.sh stop --confirm
bash /opt/openscience-development/langfuse/current/manage.sh start --confirm
bash /opt/openscience-development/langfuse/current/manage.sh backup --confirm
```

`status` only lists this Compose project. Through the client SSH tunnel, the web health endpoint is `http://127.0.0.1:3130/api/public/health` (not a server host listener); it does not prove imported traces are correct. Observe the actual UI and selected existing metadata when the task requires it, reusing valid observations on unchanged services. No model invocation is needed for this.

Five named volumes retain PostgreSQL, Redis AOF, ClickHouse, ClickHouse logs and MinIO data. Names are explicit `openscience-development-langfuse-*`; none reuse a production volume. Restart/stop retains every volume. There is no `down -v`, prune, automatic dataset deletion or migration of core data in these scripts.

Backup stops this Langfuse stack, archives the five volumes using the already-present PostgreSQL Alpine image with networking disabled, copies its private credentials and exact release, and resumes only previously running services. It never stops production. The archive stays under `backups/<UTC timestamp>` with root-only access; failed/partial archives are retained and must not be described as complete. Copy completed backups to the existing approved backup destination separately. This script is manual; no backup schedule has been installed.

The community headless initializer only applies `LANGFUSE_INIT_PROJECT_RETENTION` when the relevant entitlement is present ([upstream initializer](https://github.com/langfuse/langfuse/blob/v4.35.0/web/src/initialize.ts)). This deployment does not claim or rely on automatic retention. Bound imports and use existing server storage monitoring; disk data can grow despite memory limits.

## Rollback

For an unwanted or failed initial installation, use that release's `manage.sh stop --confirm`. Preserve credentials, images and volumes; production is unaffected. Resume the same release when the issue is addressed.

For a later upgrade, take a completed stopped-stack backup first. Langfuse automatically migrates its own databases at startup. **Do not point an older image at a migrated database and call that rollback.** The `previous-release` file is a pointer to prior configuration, not a database reversal mechanism. Either continue on the same compatible schema or restore the matched backup's data, credentials and exact images into new empty, separately named volumes under an explicitly reviewed restore operation. Keep the failed volume set intact until the user approves removing it. No destructive restore command is automated here.

## Remaining integration work

Installation and real metadata readback completed on 2026-09-14; current source/image identifiers and the separate connector are recorded in CURRENT. The API read back ten existing successful calls and two existing image failures; this does not establish scientific quality or complete historical coverage. Scheduled backups/retention, SSO and SMTP are not installed. Keep the existing private owner credential file for administrator access; do not paste its contents into chat.
