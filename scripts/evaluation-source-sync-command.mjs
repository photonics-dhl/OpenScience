export function buildEvaluationSourceMaterializeCommand(target, sourceSha) {
  if (!/^[0-9a-f]{40}$/u.test(sourceSha)) throw new Error('evaluation source SHA must be a full Git commit SHA');
  const expectedRoot = `/opt/openscience-evals/document-parser/${sourceSha}`;
  const expectedTarget = `${expectedRoot}/source`;
  if (target !== expectedTarget) throw new Error('evaluation source target must be the exact SHA source directory');

  const stage = `${expectedTarget}.stage`;
  const command = [
    'set -eu',
    `test '${target}' = '${expectedTarget}'`,
    `test '${stage}' = '${expectedTarget}.stage'`,
    `test '${expectedRoot}' = '/opt/openscience-evals/document-parser/${sourceSha}'`,
    `test "$(readlink -m '/opt/openscience-evals/document-parser')" = '/opt/openscience-evals/document-parser'`,
    `mkdir -p '${expectedRoot}'`,
    `test "$(readlink -f '${expectedRoot}')" = '${expectedRoot}'`,
    `test ! -e '${expectedTarget}'`,
    `if [ -e '${stage}' ]; then rm -rf -- '${stage}'; fi`,
    `cleanup_stage() { rm -rf -- '${stage}'; }`,
    `trap 'cleanup_stage' EXIT HUP INT TERM`,
    `mkdir -p '${stage}'`,
    `tar -xzf - --no-same-owner -C '${stage}'`,
    `test -f '${stage}/.dockerignore'`,
    `test -f '${stage}/package.json'`,
    `test -f '${stage}/infra/scripts/evaluate-document-parsers.sh'`,
    `test -f '${stage}/infra/parser-candidates/current-parser/execution-path.mjs'`,
    `printf '%s\n' '${sourceSha}' > '${stage}/.evaluation-source'`,
    `mv '${stage}' '${expectedTarget}'`,
    'trap - EXIT HUP INT TERM',
  ].join('\n');

  return { target: expectedTarget, stage, command };
}
