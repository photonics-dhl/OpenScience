#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077

root=/opt/openscience-development/langfuse
config=/etc/openscience-development/langfuse
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
docker_cmd=(env -i PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin COMPOSE_PARALLEL_LIMIT=2 docker --host unix:///var/run/docker.sock)
release=
owner_email=
public_url=http://localhost:3130
confirmed=false
while (($#)); do
  case "$1" in
    --confirm) confirmed=true; shift ;;
    --release) release=${2:?release required}; shift 2 ;;
    --owner-email) owner_email=${2:?owner email required}; shift 2 ;;
    --public-url) public_url=${2:?public URL required}; shift 2 ;;
    *) printf 'Unknown option. Use --confirm --release <commit> [--owner-email <email>] [--public-url <origin>].\n' >&2; exit 64 ;;
  esac
done
[[ $(uname -s) == Linux && $EUID == 0 && $confirmed == true ]] || { printf 'Run on the server as root with --confirm.\n' >&2; exit 64; }
[[ $release =~ ^[a-f0-9]{7,40}$ ]] || { printf 'An explicit Git release identifier is required.\n' >&2; exit 64; }
[[ $public_url =~ ^https?://([a-zA-Z0-9][a-zA-Z0-9.-]*)(:[0-9]{1,5})?$ ]] || { printf 'Use an HTTP(S) origin without a subpath.\n' >&2; exit 64; }

# No installation, upgrade, restart, or configuration read from the production stack.
for parent in /opt/openscience-development /etc/openscience-development; do
  [[ ! -L $parent ]] || { printf 'Refusing a symlinked installation parent.\n' >&2; exit 1; }
  install -d -m 0700 "$parent"
done
[[ ! -L $root && ! -L $config ]] || { printf 'Refusing a symlinked installation directory.\n' >&2; exit 1; }
install -d -m 0700 "$root" "$root/releases" "$root/logs"

if [[ ! -e $config ]]; then
  [[ $owner_email =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || { printf 'First installation requires --owner-email.\n' >&2; exit 64; }
  stage=$(mktemp -d /etc/openscience-development/.langfuse-preparing.XXXXXXXX)
  postgres_password=$(openssl rand -hex 32)
  redis_password=$(openssl rand -hex 32)
  clickhouse_password=$(openssl rand -hex 32)
  minio_password=$(openssl rand -hex 32)
  nextauth_secret=$(openssl rand -hex 32)
  salt=$(openssl rand -hex 32)
  encryption_key=$(openssl rand -hex 32)
  owner_password=$(openssl rand -hex 24)
  public_key=pk-lf-$(openssl rand -hex 16)
  secret_key=sk-lf-$(openssl rand -hex 32)
  cat > "$stage/runtime.env" <<EOF
LANGFUSE_PUBLIC_URL=$public_url
LANGFUSE_DATABASE_URL=postgresql://langfuse:$postgres_password@postgres:5432/langfuse
LANGFUSE_POSTGRES_PASSWORD=$postgres_password
LANGFUSE_REDIS_PASSWORD=$redis_password
LANGFUSE_CLICKHOUSE_PASSWORD=$clickhouse_password
LANGFUSE_MINIO_PASSWORD=$minio_password
LANGFUSE_NEXTAUTH_SECRET=$nextauth_secret
LANGFUSE_SALT=$salt
LANGFUSE_ENCRYPTION_KEY=$encryption_key
EOF
  cat > "$stage/bootstrap.env" <<EOF
LANGFUSE_INIT_ORG_ID=openscience-development
LANGFUSE_INIT_ORG_NAME=OpenScience Development
LANGFUSE_INIT_PROJECT_ID=openscience-hermes
LANGFUSE_INIT_PROJECT_NAME=Hermes
LANGFUSE_INIT_PROJECT_PUBLIC_KEY=$public_key
LANGFUSE_INIT_PROJECT_SECRET_KEY=$secret_key
LANGFUSE_INIT_USER_EMAIL=$owner_email
LANGFUSE_INIT_USER_NAME=OpenScience Operator
LANGFUSE_INIT_USER_PASSWORD=$owner_password
EOF
  cat > "$stage/integration.env" <<EOF
LANGFUSE_BASE_URL=http://development-langfuse-web:3000
LANGFUSE_PUBLIC_KEY=$public_key
LANGFUSE_SECRET_KEY=$secret_key
LANGFUSE_PROJECT_ID=openscience-hermes
EOF
  printf 'Email: %s\nPassword: %s\n' "$owner_email" "$owner_password" > "$stage/owner-credentials.txt"
  chmod 0600 "$stage/"*
  mv -T -- "$stage" "$config"
  unset postgres_password redis_password clickhouse_password minio_password nextauth_secret salt encryption_key owner_password public_key secret_key
fi
for file in runtime.env bootstrap.env integration.env owner-credentials.txt; do
  [[ -f $config/$file && ! -L $config/$file && $(stat -c '%u:%a' "$config/$file") == 0:600 ]] || {
    printf 'Langfuse credentials must be regular root-owned 0600 files; no credentials were replaced.\n' >&2; exit 1;
  }
done

target=$root/releases/$release
[[ ! -e $target ]] || { printf 'Release directory already exists; use its manage.sh to resume without replacing secrets or files.\n' >&2; exit 1; }
install -d -m 0700 "$target"
install -m 0644 "$source_dir/compose.yaml" "$source_dir/clickhouse-config.xml" "$source_dir/README.md" "$target/"
install -m 0755 "$source_dir/manage.sh" "$target/manage.sh"
if internal=$("${docker_cmd[@]}" network inspect --format '{{.Internal}}' openscience-development-telemetry-ingest 2>/dev/null); then
  [[ $internal == true ]] || { printf 'Existing telemetry-ingest network is not internal; it was not changed.\n' >&2; exit 1; }
else
  "${docker_cmd[@]}" network create --driver bridge --internal --label com.openscience.development=telemetry-ingest \
    openscience-development-telemetry-ingest >/dev/null
fi
log=$root/logs/install-$release-$(date -u +%Y%m%dT%H%M%SZ).log
[[ ! -e $root/current || -L $root/current ]] || { printf 'Unexpected current path; no services changed.\n' >&2; exit 1; }
printf 'Starting only openscience-development-langfuse; private startup log: %s\n' "$log"
if ! "${docker_cmd[@]}" compose --project-name openscience-development-langfuse --project-directory "$target" \
  --env-file "$config/runtime.env" -f "$target/compose.yaml" up -d --pull missing --wait --wait-timeout 300 > "$log" 2>&1; then
  printf 'Langfuse startup did not complete. Existing production services were not changed. See the private log; resume with the release manage.sh.\n' >&2
  exit 1
fi
[[ ! -e $root/current || -L $root/current ]] || { printf 'Refusing to overwrite a non-symlink current path.\n' >&2; exit 1; }
if [[ -L $root/current ]]; then readlink "$root/current" > "$target/previous-release"; fi
ln -s -- "$target" "$root/.current-$release-$$"
mv -Tf -- "$root/.current-$release-$$" "$root/current"
"${docker_cmd[@]}" compose --project-name openscience-development-langfuse --project-directory "$target" \
  --env-file "$config/runtime.env" -f "$target/compose.yaml" images --format json > "$target/images.json"
printf 'Langfuse started on its private network; use ssh-run.sh --development-tunnel for localhost:3130. Credentials remain under %s (0600); no secret values printed.\n' "$config"
