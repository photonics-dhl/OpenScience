#!/usr/bin/env bash
# Rotate the shared PostgreSQL application credential without exposing it in argv or logs.
set -euo pipefail

if [[ "$#" -ne 1 || "$1" != '--confirm' ]]; then
  echo "usage: $0 --confirm" >&2
  exit 64
fi
[[ "$(uname -s)" == 'Linux' && -f /opt/openscience/.release-id ]] \
  || { echo 'credential rotation is restricted to the ECS host' >&2; exit 69; }

ENV_FILE='/opt/openscience/.env.prod'
COMPOSE_FILE='/opt/openscience/infra/compose/docker-compose.prod.yml'
RELEASE="$(cat /opt/openscience/.release-id)"
[[ "$RELEASE" =~ ^[a-f0-9]{40}$ ]] || { echo 'invalid release marker' >&2; exit 69; }
RELEASE_ROOT="/opt/openscience-releases/$RELEASE"
[[ -d "$RELEASE_ROOT" && -f "$ENV_FILE" && -f "$COMPOSE_FILE" ]] \
  || { echo 'production credential inputs are incomplete' >&2; exit 69; }

export XGS_RELEASE_ROOT="$RELEASE_ROOT"
export XGS_RELEASE_IMAGE_TAG="$RELEASE"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

current_postgres_id() {
  local container_id
  container_id="$("${COMPOSE[@]}" ps -q postgres)"
  [[ "$container_id" =~ ^[a-f0-9]{64}$ ]] || return 1
  printf '%s' "$container_id"
}

mapfile -t DATABASE_CREDENTIALS < <(ENV_PATH="$ENV_FILE" node - <<'NODE'
const fs = require('node:fs');
const text = fs.readFileSync(process.env.ENV_PATH, 'utf8');
const values = new Map();
for (const line of text.split(/\r?\n/)) {
  const match = line.match(/^(POSTGRES_PASSWORD|DATABASE_URL|SEARCH_DATABASE_URL)=(.*)$/);
  if (!match) continue;
  if (values.has(match[1])) throw new Error('duplicate database credential field');
  values.set(match[1], match[2]);
}
if (values.size !== 3) throw new Error('database credential fields are incomplete');
const core = new URL(values.get('DATABASE_URL'));
const search = new URL(values.get('SEARCH_DATABASE_URL'));
if (core.username !== search.username || core.password !== search.password) {
  throw new Error('database URL credentials are not aligned');
}
if (decodeURIComponent(core.password) !== values.get('POSTGRES_PASSWORD')) {
  throw new Error('database password fields are not aligned');
}
if (!/^[a-z_][a-z0-9_]*$/.test(core.username)) throw new Error('unsafe database role');
process.stdout.write(`${core.username}\n${decodeURIComponent(core.password)}\n`);
NODE
)
[[ "${#DATABASE_CREDENTIALS[@]}" -eq 2 ]] || { echo 'credential preflight failed' >&2; exit 70; }
DATABASE_ROLE="${DATABASE_CREDENTIALS[0]}"
OLD_PASSWORD="${DATABASE_CREDENTIALS[1]}"
NEW_PASSWORD="$(openssl rand -hex 32)"
[[ "$NEW_PASSWORD" =~ ^[a-f0-9]{64}$ && "$NEW_PASSWORD" != "$OLD_PASSWORD" ]] \
  || { echo 'credential generation failed' >&2; exit 70; }

rewrite_env_password() {
  local password="$1"
  ENV_PATH="$ENV_FILE" NEW_PASSWORD="$password" node - <<'NODE'
const fs = require('node:fs');
const path = process.env.ENV_PATH;
const password = process.env.NEW_PASSWORD;
if (password.length < 24 || /[\r\n]/.test(password)) throw new Error('unsafe database password');
const original = fs.readFileSync(path, 'utf8');
const stats = fs.statSync(path);
const counts = { POSTGRES_PASSWORD: 0, DATABASE_URL: 0, SEARCH_DATABASE_URL: 0 };
const rewritten = original.split(/(?<=\n)/).map((line) => {
  const ending = line.endsWith('\r\n') ? '\r\n' : line.endsWith('\n') ? '\n' : '';
  const body = ending ? line.slice(0, -ending.length) : line;
  const match = body.match(/^(POSTGRES_PASSWORD|DATABASE_URL|SEARCH_DATABASE_URL)=(.*)$/);
  if (!match) return line;
  const key = match[1];
  counts[key] += 1;
  if (key === 'POSTGRES_PASSWORD') return `${key}=${password}${ending}`;
  const url = new URL(match[2]);
  url.password = password;
  return `${key}=${url.toString()}${ending}`;
}).join('');
if (Object.values(counts).some((count) => count !== 1)) {
  throw new Error('database credential rewrite was not exact');
}
const temporary = `${path}.rotate-${process.pid}`;
fs.writeFileSync(temporary, rewritten, { flag: 'wx', mode: stats.mode & 0o777 });
fs.chmodSync(temporary, stats.mode & 0o777);
fs.renameSync(temporary, path);
NODE
}

alter_database_role() {
  local password="$1"
  local postgres_id password_sql
  postgres_id="$(current_postgres_id)"
  password_sql="${password//\'/\'\'}"
  printf 'ALTER ROLE "%s" PASSWORD '\''%s'\'';\n' "$DATABASE_ROLE" "$password_sql" \
    | docker exec -i "$postgres_id" sh -lc \
      'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null
}

recreate_database_consumers() {
  "${COMPOSE[@]}" up -d --force-recreate postgres api agent-worker web
}

wait_for_database_consumers() {
  local postgres_id api_id worker_id web_id
  local postgres_health api_health worker_health web_state
  for _attempt in $(seq 1 90); do
    postgres_id="$("${COMPOSE[@]}" ps -q postgres)"
    api_id="$("${COMPOSE[@]}" ps -q api)"
    worker_id="$("${COMPOSE[@]}" ps -q agent-worker)"
    web_id="$("${COMPOSE[@]}" ps -q web)"
    postgres_health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$postgres_id" 2>/dev/null || true)"
    api_health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$api_id" 2>/dev/null || true)"
    worker_health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$worker_id" 2>/dev/null || true)"
    web_state="$(docker inspect -f '{{.State.Status}}' "$web_id" 2>/dev/null || true)"
    if [[ "$postgres_health" == 'healthy' && "$api_health" == 'healthy' \
      && "$worker_health" == 'healthy' && "$web_state" == 'running' ]]; then
      return 0
    fi
    sleep 2
  done
  return 1
}

ROLE_CHANGED=0
ROTATION_COMPLETE=0
rollback_on_exit() {
  local status=$?
  trap - EXIT
  if [[ "$status" -ne 0 && "$ROLE_CHANGED" -eq 1 && "$ROTATION_COMPLETE" -eq 0 ]]; then
    set +e
    rewrite_env_password "$OLD_PASSWORD"
    alter_database_role "$OLD_PASSWORD"
    recreate_database_consumers >/dev/null
    wait_for_database_consumers
    echo 'DB_CREDENTIAL_ROTATION_ROLLED_BACK' >&2
    set -e
  fi
  unset OLD_PASSWORD NEW_PASSWORD DATABASE_CREDENTIALS
  exit "$status"
}
trap rollback_on_exit EXIT

alter_database_role "$NEW_PASSWORD"
ROLE_CHANGED=1
rewrite_env_password "$NEW_PASSWORD"
recreate_database_consumers
wait_for_database_consumers
[[ "$(stat -c '%a' "$ENV_FILE")" == '600' ]] || { echo 'production env mode changed' >&2; exit 70; }

ROTATION_COMPLETE=1
printf 'DB_CREDENTIAL_ROTATION_OK release=%s postgres=healthy api=healthy worker=healthy web=running\n' "$RELEASE"
unset OLD_PASSWORD NEW_PASSWORD DATABASE_CREDENTIALS
