#!/usr/bin/env bash
# Server-only artifact preparation/build. Does not install a host package or
# start/stop/reconfigure Squid, Docker, or any application service.
set -euo pipefail
set +x
umask 077

[[ $(uname -s) == Linux && $EUID == 0 ]] || { printf 'Run as root on the server.\n' >&2; exit 64; }
compat_release=${SQUID_COMPAT_RELEASE:?Set the reviewed infrastructure Git revision}
[[ $compat_release =~ ^[a-f0-9]{40}$ ]] || exit 64
compat_source=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
compat_root=/opt/openscience-development/squid-compat/$compat_release
base_image=alibaba-cloud-linux-4-registry.cn-hangzhou.cr.aliyuncs.com/alinux4/alinux4:latest
builder_image=openscience-squid-compat-builder:$compat_release

install -d -m 0700 "$compat_root" "$compat_root/inputs" "$compat_root/context"
install -d -m 0750 -o 1000 -g 1000 "$compat_root/work"

fetch_once() {
  local url=$1 destination=$2
  if [[ ! -f $destination ]]; then
    with-proxy curl --fail --location --retry 2 --connect-timeout 20 --max-time 240 \
      --output "$destination.download" "$url"
    mv -- "$destination.download" "$destination"
  fi
}
fetch_once 'https://mirrors.aliyun.com/alinux/4.0/updates/source/Packages/squid-7.2-1.alnx4.src.rpm' \
  "$compat_root/inputs/squid-7.2-1.alnx4.src.rpm"
fetch_once 'https://mirrors.aliyun.com/alinux/4.0/updates/x86_64/os/Packages/squid-7.2-1.alnx4.x86_64.rpm' \
  "$compat_root/inputs/squid-7.2-1.alnx4.x86_64.rpm"

# Authenticate the source and rollback packages using the already trusted vendor
# key before executing their build instructions. No new key or signature bypass.
rpmkeys --checksig "$compat_root/inputs/squid-7.2-1.alnx4.src.rpm" \
  "$compat_root/inputs/squid-7.2-1.alnx4.x86_64.rpm"

if ! docker image inspect "$base_image" >/dev/null 2>&1; then docker pull "$base_image"; fi
base_digest=$(docker image inspect --format '{{index .RepoDigests 0}}' "$base_image")
printf '%s\n' "$base_digest" > "$compat_root/inputs/base-image.txt"
cp "$compat_source/Dockerfile" "$compat_source/build-inside.sh" \
  "$compat_source/prepare-spec.py" "$compat_source/squid-bug5520.patch" "$compat_root/context/"
cp "$compat_root/inputs/squid-7.2-1.alnx4.src.rpm" "$compat_root/context/"

# Only the isolated image receives a compiler toolchain and vendor BuildRequires.
# The existing Debian Node images have a different RPM/glibc/build-macro base.
with-proxy docker build --pull=false --network host \
  --build-arg "BASE_IMAGE=$base_digest" \
  --build-arg HTTP_PROXY --build-arg HTTPS_PROXY --build-arg http_proxy --build-arg https_proxy --build-arg NO_PROXY \
  --tag "$builder_image" "$compat_root/context" > "$compat_root/builder-image.log" 2>&1

# Compilation is offline with a small writable build volume, no host compiler,
# Docker socket, Squid configuration, secrets, app files, or service mounts.
docker run --rm --pull never --init --network none --read-only --user 1000:1000 \
  --cap-drop ALL --security-opt no-new-privileges \
  --cpus 2 --memory 4g --memory-swap 4g --pids-limit 256 \
  --tmpfs /tmp:rw,nosuid,nodev,size=256m,uid=1000,gid=1000,mode=1770 \
  --tmpfs /var/tmp:rw,nosuid,nodev,size=128m,uid=1000,gid=1000,mode=1770 \
  --mount "type=bind,source=$compat_root/work,target=/build" \
  "$builder_image" > "$compat_root/rpm-build.log" 2>&1
printf 'RPM build finished: %s/work/rpmbuild/RPMS/x86_64/squid-7.2-1.alnx4.openscience.1.x86_64.rpm\n' "$compat_root"
printf 'No host installation or proxy restart performed.\n'
