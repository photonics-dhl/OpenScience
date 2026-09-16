# Read-only Serena source intelligence

This package runs upstream Serena's TypeScript language-server tools against a
selected-source snapshot of one exact OpenScience Git commit. It exposes only
`find_symbol`, `get_symbols_overview` and `find_referencing_symbols` through the
standard streamable HTTP MCP endpoint `http://127.0.0.1:3132/mcp` on the client
through `ssh-run.sh --development-tunnel`, or inside the Serena container.
No shell, editing, memory, project-switching or dashboard tool is exposed.

## Upstream and dependency choices

- [Serena](https://github.com/oraios/serena/tree/403ad0a562bbc86ff5a0e26c23544dbd99235c15)
  is pinned to commit `403ad0a562bbc86ff5a0e26c23544dbd99235c15`, under its
  [MIT license](https://github.com/oraios/serena/blob/403ad0a562bbc86ff5a0e26c23544dbd99235c15/LICENSE).
  Python dependencies use that commit's own `uv.lock`, with `uv sync --frozen
  --no-dev --no-editable`. The server's existing `/usr/bin/uv` is reused only in
  the image build stage; no global uv or Python installation is added.
- TypeScript `5.9.3` and typescript-language-server `5.1.3` are this commit's exact
  upstream defaults. The standalone pnpm 9.15 lock contains their official npm
  integrity metadata; both packages have no external runtime dependency entries.
- The cached `node:22-bookworm-slim` and `python:3.12-slim` base images are reused.
  Only Node and the installed language-server tree enter the Python runtime;
  npm/pnpm/uv do not enter the runtime. `libstdc++6` is installed in the runtime
  image because the copied Node binary needs the C++ shared library absent from
  the Python slim base.

The upstream [TypeScript provider](https://github.com/oraios/serena/blob/403ad0a562bbc86ff5a0e26c23544dbd99235c15/src/solidlsp/language_servers/typescript_language_server.py)
uses `TypeScriptLanguageServer/ts-lsp/node_modules/.bin/typescript-language-server`
for this version pair. Serena passes its home directory to SolidLSP, whose
resources directory is `language_servers/static`. The image therefore installs
the server at:

```text
/opt/serena-home/language_servers/static/TypeScriptLanguageServer/ts-lsp/node_modules/.bin/typescript-language-server
```

The controlled configuration also sets the upstream [dependency provider's
`ls_path` override](https://github.com/oraios/serena/blob/403ad0a562bbc86ff5a0e26c23544dbd99235c15/src/solidlsp/dependency_provider.py)
to that exact executable. Runtime startup uses the installed server directly;
it does not call the dependency installer. Upstream disables automatic TypeScript
typing acquisition, and the runtime network is internal with no outgoing route.

## Source and configuration boundary

`snapshot.py` reads the existing immutable release archive's `.release-source`
and `.release-inputs.sha256`, requires their source commit to match the requested
revision, and uses the existing manifest's entry list. It does not rerun manifest
verification, compute new hashes or require a Git checkout/bundle. It selects
TypeScript/JavaScript source in `apps`, `packages`, `infra` and `scripts`; it does
not copy Git internals, `.env*`, `.serena`, `node_modules`, generated/build output,
tests, fixtures, temporary files, data, binary assets or repository instructions.
Every copied path is opened one component at a time with `O_NOFOLLOW`; only regular
files are read. Symlink paths are rejected. Package manifests are read only to obtain
workspace package names, and are not copied or executed.

The exported source bytes come from that identified release. A generated `tsconfig.json`
provides source mappings for `@openscience/*` package entry points and the web
`@/*` alias. Repository tsconfig files, TypeScript plugins, package scripts and
Serena configuration are not loaded. `snapshot.json` records the full Git commit
and selected scope. The server reads that immutable file at startup and includes
`sourceRevision` in every successful MCP tool result; `query.py` also places it at the top of
its JSON output. This is provenance, not a completeness or quality score. External
dependency types are intentionally absent, so symbol
coverage across third-party libraries and dynamic imports is limited.

`prepare-config.py` creates complete configuration from the pinned upstream's
actual dataclass defaults during the image build, then applies controlled
overrides. This avoids runtime migration writes for missing configuration keys.
The global/project/context tool sets are fixed to the three read tools, with
`read_only: true`, no default editing modes and no project activation command.
Global and project memory patterns exclude all memories, and the empty memory
directories are read-only. Project metadata lives at `/opt/serena-project`, so
there is no fallback to a source checkout's `.serena` directory.
The image also precreates the empty `prompt_templates` directory: the upstream
prompt factory calls `makedirs(exist_ok=True)` during startup even without custom
templates. Its directory remains read-only in the running container.

The process runs as uid/gid `1000:1000`, with read-only root/config/source, no
capabilities, `no-new-privileges`, 3 GiB RAM, 2 CPU, 160 PIDs and 128 MiB temporary
space. Only revision-specific language-server caches and logs are writable.
There is no production network, secret mount, Docker socket, database access or
model credential. The image contains ordinary operating-system executables for
its runtime, but no tool can invoke an arbitrary shell command.

## Server installation and use

The main task performs the installation through the existing project SSH wrapper.
Use an existing immutable release archive and its explicit source commit:

```sh
bash /path/to/release/infra/development-platform/code-intelligence/install.sh \
  --source-release /opt/openscience-releases/FULL_SOURCE_COMMIT \
  --revision FULL_SOURCE_COMMIT
```

The source commit must match the archive's existing release metadata. This exports
selected release files without requiring `.git` or reading a dirty worktree. The installer reuses a cached pinned
Serena source archive, the existing uv binary and image/dependency build caches.
Missing upstream source is fetched through the existing server `with-proxy`.
Builds use ordinary Dockerfile `RUN` instructions with the server's legacy builder;
no BuildKit/buildx installation is needed. Build downloads use the existing
host-network proxy; runtime containers receive no proxy
or external network. Failed downloads/partial snapshot directories are retained
and do not replace a completed snapshot.

Storage is `/opt/openscience-development/code-intelligence/`: immutable snapshots
under `snapshots/<source-commit>`, cache/log state under `state/<source-commit>`,
and retained upstream/build resources. `SERENA_IMAGE_TAG` defaults to the selected
source commit and can be supplied by the main task when the infrastructure
revision differs. Record both the source commit and infrastructure image tag in
the existing CURRENT handoff.

Installation performs image build/configuration creation and service startup.
It runs no tests, preflight suite, rehearsal, fixture query or model task. Initial
language-server indexing is part of serving the actual source project.

For an actual source lookup after installation, set the same paths/tag and use
the included standard MCP client:

```sh
export SERENA_IMAGE_TAG=INSTALLED_IMAGE_TAG
export SERENA_SNAPSHOT_DIR=/opt/openscience-development/code-intelligence/snapshots/FULL_SOURCE_COMMIT
export SERENA_STATE_DIR=/opt/openscience-development/code-intelligence/state/FULL_SOURCE_COMMIT
docker compose --env-file /dev/null \
  --file /path/to/release/infra/development-platform/code-intelligence/compose.yaml \
  exec -T serena python /opt/serena/query.py \
  overview packages/ai-gateway/src/gateway.ts
```

The same client accepts `find packages/ai-gateway/src/gateway.ts AiGateway` and
`references packages/ai-gateway/src/gateway.ts AiGateway`. It initializes the real
MCP session and performs the selected read tool call. Its JSON identifies the
operation, requested path and mounted source revision; the nested MCP response
also carries that revision for clients which do not use `query.py`. Results retain upstream
symbol names/paths; it does not invent an edge list or convert missing references
into proof that there are no consumers.

`serve.py` composes the official `SerenaMCPFactory` and explicitly sets the MCP SDK's
`TransportSecuritySettings` before starting the standard transport. This avoids
the SDK constructor's explicit `None` overriding an environment-only security setting.
MCP clients can connect directly to the loopback endpoint through their existing
trusted server connection. DNS-rebinding protection allows only localhost host
and origin values. A later authenticated ingress must retain that local upstream
Host and an explicitly trusted client origin. This package does not expose a
public unauthenticated service or configure clients' personal MCP settings.

For rollback, retain the prior image/source snapshot, set their exact tag and
revision-specific state paths, and run the same Compose startup command. Do not
delete snapshots or share a mutable checkout across revisions. Source updates
require a new selected commit/snapshot; they do not change the product release.

## Existing module-dependency report

`module-graph.sh` reuses `/opt/openscience/node_modules/.bin/depcruise`, already
installed by the product workspace. It does not install another dependency-cruiser
or run `audit:dep`, forbidden-rule checks, tests or a preflight. It reads the
retained source archive specified by `--revision`; repeated `--scope` options select
source directories. The default scope is `apps/agent-worker/src/presentation` and `packages/ai-gateway/src`. The reporting
configuration has no forbidden rules and maps the Gateway package import to its
source entry so those module edges resolve without claiming deployed `dist` is
the source tree.

```sh
bash /path/to/release/infra/development-platform/code-intelligence/module-graph.sh \
  --revision 89d05d6dfcf432765697762864e9406ea3588ab8 \
  --output /operator/chosen/existing-directory/presentation-gateway.json
```

The requested file is dependency-cruiser's unmodified standard JSON. A companion
`.source.json` records source commit, scopes and the actual installed generator
version. Existing output files are never overwritten; a failed command retains
its partial output for inspection. This produces a module dependency map and
does not claim function-call edges or complete runtime behavior.

Serena supplies language-server symbol/reference navigation. The existing
dependency-cruiser remains a module dependency map. Neither installation nor
either graph alone establishes a complete knowledge graph or that the product
uses a capability correctly. Static implementation was prepared without running
tests, builds, installation or symbol queries; the main task records actual
server results and observed limitations.
