export function buildReleaseMaterializeCommand(releaseRoot, releaseSha) {
  const expectedRoot = `/opt/openscience-releases/${releaseSha}`;
  if (!/^[0-9a-f]{40}$/.test(releaseSha)) throw new Error('release SHA must be a full Git commit SHA');
  if (releaseRoot !== expectedRoot) throw new Error('release root must be the immutable SHA directory');

  const stage = `${releaseRoot}.stage`;
  const marker = `${releaseRoot}/.release-source`;
  return [
    'set -eu',
    `test '${releaseRoot}' = '${expectedRoot}'`,
    `mkdir -p '/opt/openscience-releases'`,
    `if [ -d '${releaseRoot}' ]; then test "$(cat '${marker}')" = '${releaseSha}'; tar -tzf - >/dev/null; exit 0; fi`,
    `if [ -e '${stage}' ]; then rm -rf -- '${stage}'; fi`,
    `cleanup_stage() { rm -rf -- '${stage}'; }`,
    `trap 'cleanup_stage' EXIT HUP INT TERM`,
    `mkdir -p '${stage}'`,
    `tar -xzf - -C '${stage}'`,
    `test -f '${stage}/.dockerignore'`,
    `test -f '${stage}/package.json'`,
    `test -f '${stage}/infra/compose/docker-compose.prod.yml'`,
    `printf '%s\\n' '${releaseSha}' > '${stage}/.release-source'`,
    `mv '${stage}' '${releaseRoot}'`,
    'trap - EXIT HUP INT TERM',
  ].join('\n');
}
