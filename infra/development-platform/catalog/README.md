# OpenScience Backstage Catalog

This is the standard Backstage catalog backend, available as a private read API
at client `127.0.0.1:3131` through `ssh-run.sh --development-tunnel`.
It is not a complete Backstage browser portal.
`createBackend`, the upstream catalog plugin, the upstream permission plugin and
their standard entity processing produce the catalog and its ownership/dependency
relations. There is no scaffolder, deployment action, publication action or custom
catalog schema. Repository entities are inventory, not scientific quality evidence.

## Pinned upstream and scope

The Backstage packages come from the official [1.54.7 release](https://github.com/backstage/backstage/releases/tag/v1.54.7)
and its [compatible package manifest](https://versions.backstage.io/v1/releases/1.54.7/manifest.json),
read on 2026-09-14:

| Package | Version |
| --- | --- |
| `@backstage/backend-defaults` | `0.17.8` |
| `@backstage/backend-plugin-api` | `1.10.0` |
| `@backstage/plugin-catalog-backend` | `3.9.1` |
| `@backstage/plugin-permission-backend` | `0.7.15` |
| `@backstage/plugin-permission-common` | `0.9.10` |
| `@backstage/plugin-permission-node` | `0.11.3` |
| `better-sqlite3` | `12.11.1` |

The [SQLite package metadata](https://registry.npmjs.org/better-sqlite3/12.11.1)
supports Node 22 and satisfies `backend-defaults`' `^12.0.0` peer requirement.
The plain JavaScript entry uses the existing `node:22-bookworm-slim` image. No
frontend scaffold or TypeScript compilation is needed. The first server install
generates this isolated package's `pnpm-lock.yaml` using pnpm `9.15.0`; retrieve
and commit that file with the implementation. Subsequent image installs use it
with `--frozen-lockfile`. Do not generate a yarn/npm lock or update the product
workspace dependency graph for this separate infrastructure service.

The [catalog file-location documentation](https://backstage.io/docs/features/software-catalog/configuration/#local-file-type-file-configurations)
recommends local files for development use. This deployment is a small private
development inventory whose sole input is a managed repository YAML bind mount.
It does not treat local files as an enterprise production ingestion integration.
The standard processor periodically rereads `catalog-info.yaml`; it does not scan
arbitrary repository files or execute SKILL.md instructions. URL and placeholder
processors are disabled, and the runtime has no outgoing network route.
The descriptor is a single-file bind mount: after Git replaces that file with a
new inode, recreate the catalog container to bind the new revision. Use the
normal versioned image/source deployment rather than assuming a running bind
mount follows an atomic file replacement.

## Files and boundaries

- `backend.mjs`: official backend composition, read policy and catalog HTTP method restriction.
- `app-config.yaml`: static file provider, separate persistent SQLite files and two service identities.
- `catalog-info.yaml`: standard `Domain`, `System`, `Component`, `API`, `Resource`, `Group` and `User` entities.
- `Dockerfile`, `compose.yaml`, `install.sh`: server installation/start with bounded resources and persistent storage.
- `query.mjs`: a small GET-only client for the standard API; it accepts no URL, body or token argument.

The container runs as `1000:1000`, with read-only root/source, dropped capabilities,
`no-new-privileges`, 2 GiB memory, 1.5 CPU, 128 PIDs and a 64 MiB temporary directory.
It has a dedicated internal network and no Docker socket, application environment
file, production network membership or business database credentials. Only
`/opt/openscience-development/catalog/state` is durable and writable.
Backstage creates its own SQLite schema there during normal startup; this never
runs OpenScience business migrations. Do not scale this SQLite deployment to
multiple replicas sharing the directory.

Keep `backend.rateLimit` in object form (`global: true`). With the pinned
`backend-defaults`, the root router accepts the boolean shorthand, but plugin
routers traverse `backend.rateLimit.plugin.<pluginId>` and reject that boolean.
The resulting startup error leaves the root listener responding with 404 while
the catalog routes are unavailable. The object form retains upstream global
limiter defaults and allows the catalog and permission plugins to initialize.

`spec.owner` derives standard `ownedBy` relations. `spec.dependsOn` and API
declarations derive dependency and consumption relations. Source annotations link
real repository directories. `resource:production/application` points to the
deployed environment and its release marker; `resource:candidate/onchip-video-release`
points to the development branch/worktree. Repository source and requirement links
follow that active delivery branch; the old `main` lacks later product decisions.
The OpenScience system also links the existing Taskmaster current-tag selector and
tagged task store so a catalog read can locate stable acceptance criteria without
copying task status into Backstage.
These links locate editable code, not the deployed SHA. The existing
CURRENT handoff remains the only release/rollback and observed-result narrative.
Runtime research skills and repository development skills are different entities:
installation of a skill file does not imply that Hermes imports or executes it.

The public research API entity links the existing authoritative OpenAPI endpoint.
Its embedded definition contains only valid OpenAPI discovery metadata, with no
copied endpoint or response schema. Follow that link for the actual contract.

## Server installation

The main task performs server operations through the existing project SSH wrapper.
Run these commands only in the server shell, from the transferred repository
directory. There are no tests, probes, preflight commands or model calls here.
The example tag should be the actual candidate commit chosen by the main task.

```sh
cd /opt/openscience/infra/development-platform/catalog
CATALOG_IMAGE_TAG=<candidate-commit> bash ./install.sh
```

Use the actual transferred checkout path if the product checkout remains on its
deployed release. The installer derives `CATALOG_SOURCE_DIR` from its own file;
do not copy a whole repository or secret directory into the image. It reuses the
existing Node image, creates only the missing two token files, generates the lock
if absent, builds the catalog image and requests service startup. Native SQLite
build tools are installed only in the build stage and do not enter the runtime
image. No global package manager or product dependencies are installed.

Each generated token is 32 random bytes encoded as hex. Tokens are not printed,
passed as process arguments or placed in Compose environment variables. The
secrets parent directory is root-only `0700`; individual `0600` token files are
owned by container uid 1000 because Compose bind-file secrets preserve host
ownership. Existing tokens survive reinstall. Source `catalog-info.yaml` must be
readable by uid 1000; the repository file contains no credentials.

After the first install, retrieve only the newly generated
`infra/development-platform/catalog/pnpm-lock.yaml` to this same repository path
and commit it. The installer does not create a source commit or claim service
readiness. The parent task records actual install/start results and the subsequent
authorized catalog read in CURRENT and the capability inventory.

## Actual standard API use

In the server shell, set the same source directory and image tag used at install.
Use the normal installation result for a real capability lookup; no fixture or
synthetic catalog record is required:

```sh
export CATALOG_SOURCE_DIR=/opt/openscience/infra/development-platform/catalog
export CATALOG_IMAGE_TAG=<candidate-commit>
docker compose --env-file /dev/null --file "$CATALOG_SOURCE_DIR/compose.yaml" \
  exec -T catalog node /app/query.mjs codex entity component:default/agent-worker
docker compose --env-file /dev/null --file "$CATALOG_SOURCE_DIR/compose.yaml" \
  exec -T catalog node /app/query.mjs codex entity group:default/openscience-maintainers
docker compose --env-file /dev/null --file "$CATALOG_SOURCE_DIR/compose.yaml" \
  exec -T catalog node /app/query.mjs hermes list \
  'kind=component,relations.ownedBy=group:default/openscience-maintainers'
```

The first command performs `GET /api/catalog/entities/by-name/component/default/agent-worker`.
Its standard response should contain `spec.owner` and `relations`, including
`ownedBy` targeting `group:default/openscience-maintainers`, `partOf` targeting the
OpenScience system, and `dependsOn` targeting the Gateway, runtime skills and
other declared dependencies. The second resolves the actual owner entity. The
third uses the standard `/entities/by-query` filter and returns `items`,
`totalItems` and `pageInfo`; clients must honor a returned cursor for larger lists.
Entity processing is asynchronous after startup; a not-yet-ingested entity can
return 404. This does not warrant resubmitting or recreating catalog data.

The helper prints the real JSON response and only HTTP status on request failure.
It never prints credentials. The [official catalog API documentation](https://backstage.io/docs/features/software-catalog/software-catalog-api/)
defines the response and filter conventions. Successful ingestion/read proves
directory availability and the declared relations, not correctness of research
outputs, completeness of the inventory or a frontend portal.

## Authentication and Codex/Hermes integration

Authentication uses official [static service tokens and access restrictions](https://backstage.io/docs/auth/service-to-service-auth/).
`codex-catalog-reader` and `hermes-catalog-reader` are separate revocable subjects.
Each may target only the `catalog` plugin and the named `catalog.entity.read` and
`catalog.location.read` permissions. The standard permission service is enabled;
its policy allows only those two permissions. No guest auth or disabled default
auth policy is configured.

The upstream `catalog.readonly` setting alone still permits entity deletion, and
the refresh route has no dedicated permission in this pinned implementation.
That concrete gap is why the root HTTP service also rejects all methods other
than GET/HEAD under `/api/catalog` before normal plugin routing. Default Backstage
middleware remains enabled with `applyDefaults()`. This removes writes, refresh,
analysis and validation API calls, including POST read-query variants; clients use
the documented GET variants. The method restriction does not grant access:
Backstage still authenticates every catalog read.

Codex can use the existing server execution boundary with the GET helper above.
Do not copy a token into a prompt, command line or browser storage. A direct
read-only consumer uses `Authorization: Bearer <its-own-token>`, obtained from its
dedicated server secret file, and an allowlisted catalog URL. Hermes integration
requires explicitly mounting only the Hermes token into the existing trusted
worker and providing a narrow reachable catalog endpoint. That product wiring
is not performed by this infrastructure package; do not join catalog to the
business data network or expose a Docker socket to achieve it. The two identities
have the same read scope but can be rotated independently.

The host entry is loopback only. Any later external ingress must be configured by
the main task with its existing operator authentication and forwarding policy;
do not expose this port publicly or replace service tokens with unauthenticated
access. A browser will receive JSON/API responses, not a full developer portal.

## Persistence and rollback

Keep a unique image tag for each installed source revision and retain previous
images. To roll back only an image/configuration change, restore the earlier
catalog source/config and tag, then use the same Compose startup command. This
does not change the OpenScience application release. If an upstream catalog
upgrade changes its own database schema, stop this single service and copy its
entire state directory before upgrading; restore that matching directory and
image together when a downgrade requires it. Do not copy a live SQLite database
file alone, and do not delete state directories, images or source history.

Tokens are separate from the database; preserve them during rollback. Rotate a
single token by preparing a replacement server file with the same `0600`
permissions and ownership, retaining the prior protected copy, then recreating
the service so the `$file` configuration reloads. Update only that consumer's
secret. Never print either value.

Implementation status at handoff: static files written; no local installation,
build, tests or runtime query executed by this worker. Server lock generation,
image build/start, actual entity/owner read and any external ingress or Hermes
product connection remain the main task's deployment responsibilities.
