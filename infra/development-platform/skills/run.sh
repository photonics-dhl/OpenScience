#!/usr/bin/env bash
set -euo pipefail
set +x

skills_release=${SKILLS_RELEASE:?Set the full infrastructure Git revision}
[[ $skills_release =~ ^[a-f0-9]{40}$ ]] || exit 64
skills_operation=${1:-list}
if (($# == 0)); then set -- list; fi
skills_args=(run --rm --pull never --init --read-only --user 1000:1000
  --cap-drop ALL --security-opt no-new-privileges --memory 256m --cpus 0.5 --pids-limit 32
  --workdir /project --tmpfs /tmp:rw,noexec,nosuid,nodev,size=16m,uid=1000,gid=1000,mode=1770)

case "$skills_operation" in
  list)
    [[ $# == 1 ]] || { printf '%s\n' 'Usage: run.sh list' >&2; exit 64; }
    skills_project_dir=${SKILLS_PROJECT_DIR:?Set SKILLS_PROJECT_DIR to the existing read-only project source snapshot}
    exec docker "${skills_args[@]}" --network none \
      --mount "type=bind,source=$skills_project_dir,target=/project,readonly" "openscience-development-skills:$skills_release" list
    ;;
  find)
    [[ $# == 2 && -n $2 && $2 != -* ]] || { printf '%s\n' 'Usage: run.sh find "search terms"' >&2; exit 64; }
    # Native Node fetch needs --use-env-proxy (Node >=22.21). Host networking
    # reaches the existing loopback proxy; the CLI opens no listening port.
    exec with-proxy docker "${skills_args[@]}" --network host \
      --env HTTP_PROXY --env HTTPS_PROXY --env http_proxy --env https_proxy --env NO_PROXY \
      "openscience-development-skills:$skills_release" find "$2"
    ;;
  *) printf '%s\n' 'Supported operations: list; find "search terms".' >&2; exit 64 ;;
esac
