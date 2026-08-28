export function buildReleaseMaterializeCommand(releaseRoot, releaseSha) {
  const expectedRoot = `/opt/openscience-releases/${releaseSha}`;
  if (!/^[0-9a-f]{40}$/.test(releaseSha)) throw new Error('release SHA must be a full Git commit SHA');
  if (releaseRoot !== expectedRoot) throw new Error('release root must be the immutable SHA directory');

  const stage = `${releaseRoot}.stage`;
  const marker = `${releaseRoot}/.release-source`;
  const manifestTool = `${releaseRoot}/scripts/release-input-manifest.mjs`;
  return [
    'set -eu',
    `test '${releaseRoot}' = '${expectedRoot}'`,
    `mkdir -p '/opt/openscience-releases'`,
    `if [ -d '${releaseRoot}' ]; then tar -tzf - >/dev/null; test "$(cat '${marker}')" = '${releaseSha}'; /usr/bin/node '${manifestTool}' verify --root '${releaseRoot}' --sha '${releaseSha}'; exit 0; fi`,
    `if [ -e '${stage}' ]; then rm -rf -- '${stage}'; fi`,
    `cleanup_stage() { rm -rf -- '${stage}'; }`,
    `trap 'cleanup_stage' EXIT HUP INT TERM`,
    `mkdir -p '${stage}'`,
    `tar -xzf - -C '${stage}'`,
    `test -f '${stage}/.dockerignore'`,
    `test -f '${stage}/package.json'`,
    `test -f '${stage}/infra/compose/docker-compose.prod.yml'`,
    `test ! -e '${stage}/.release-source'`,
    `test ! -e '${stage}/.release-inputs.sha256'`,
    `printf '%s\\n' '${releaseSha}' > '${stage}/.release-source'`,
    `chmod 0444 '${stage}/.release-source'`,
    `/usr/bin/node '${stage}/scripts/release-input-manifest.mjs' create --root '${stage}' --sha '${releaseSha}'`,
    `/usr/bin/node '${stage}/scripts/release-input-manifest.mjs' verify --root '${stage}' --sha '${releaseSha}'`,
    `mv '${stage}' '${releaseRoot}'`,
    'trap - EXIT HUP INT TERM',
  ].join('\n');
}
