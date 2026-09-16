#!/usr/bin/env bash
# Produce a standard module-dependency JSON artifact from the retained release.
# This is a source-reporting operation, not audit:dep, a test or a preflight.
set -euo pipefail
set +x
set -o noclobber

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source_commit=""
scopes=()
output=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output) output="$2"; shift 2 ;;
    --revision) source_commit="$2"; shift 2 ;;
    --scope) scopes+=("$2"); shift 2 ;;
    *) printf '%s\n' "Unknown argument: $1" >&2; exit 1 ;;
  esac
done
[[ $source_commit =~ ^[a-f0-9]{40}$ ]] || { printf 'Supply --revision with the source Git commit.\n' >&2; exit 64; }
source_release="/opt/openscience-releases/$source_commit"
if [[ ${#scopes[@]} == 0 ]]; then scopes=(apps/agent-worker/src/presentation packages/ai-gateway/src); fi
for scope in "${scopes[@]}"; do
  [[ $scope =~ ^(apps|packages)/[a-z0-9_-]+/src(/[a-zA-Z0-9_/-]+)?$ && $scope != *..* ]] || exit 64
done
if [[ "$output" != /* || "$output" != *.json || -e "$output" || -e "$output.source.json" || -e "$output.tsconfig.json" ]]; then
  printf '%s\n' 'Supply --output with a new absolute .json path in an existing output directory.' >&2
  exit 1
fi
# Use the already-recorded deployment identity, without invoking manifest checks.
recorded_commit="$(< "$source_release/.release-source")"
if [[ "$recorded_commit" != "$source_commit" ]]; then
  printf '%s\n' 'The retained source release identity does not match the requested source.' >&2
  exit 1
fi
cd -- "$source_release"
scope_pattern=$(IFS='|'; printf '%s' "${scopes[*]}")
export XGS_GRAPH_SCOPE_PATTERN="^($scope_pattern)(/|$)"
export XGS_GRAPH_TSCONFIG="$output.tsconfig.json"
node - "$source_release" "$XGS_GRAPH_TSCONFIG" "${scopes[@]}" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const [sourceDirectory, configPath, ...scopes] = process.argv.slice(2);
const parent = path.dirname(configPath);
const parentStat = fs.lstatSync(parent);
const realParent = fs.realpathSync(parent);
const protectedRoots = [sourceDirectory, '/opt/openscience', '/opt/openscience-releases'];
if (!parentStat.isDirectory() || realParent !== path.resolve(parent) ||
    parentStat.uid !== 0 || (parentStat.mode & 0o022) !== 0 ||
    protectedRoots.some(root => realParent === root || realParent.startsWith(root + '/'))) {
  throw new Error('Report parent must be a root-owned non-writable real directory outside application releases');
}
// dependency-cruiser supports TypeScript paths through tsConfig; its own
// enhancedResolveOptions schema intentionally does not accept an alias map.
const config = {
  extends: path.join(sourceDirectory, 'tsconfig.base.json'),
  include: scopes.map(scope => path.join(sourceDirectory, scope, '**/*')),
  compilerOptions: {
    baseUrl: sourceDirectory,
    paths: {
      '@openscience/*': ['packages/*/src/index.ts'],
      '@/*': ['apps/web/*'],
    },
  },
};
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', { flag: 'wx', mode: 0o444 });
NODE
/opt/openscience/node_modules/.bin/depcruise \
  "${scopes[@]}" \
  --config "$script_dir/module-graph.config.cjs" --output-type json > "$output"
node - "$source_commit" "$source_release" "$output" "${scopes[@]}" <<'NODE'
const fs = require('node:fs');
const [sourceCommit, sourceDirectory, output, ...scopes] = process.argv.slice(2);
const generatorVersion = JSON.parse(fs.readFileSync('/opt/openscience/node_modules/dependency-cruiser/package.json', 'utf8')).version;
const provenance = {
  sourceCommit,
  sourceDirectory,
  scopes,
  generator: 'dependency-cruiser',
  generatorVersion,
  output,
  kind: 'module-dependencies',
};
fs.writeFileSync(`${output}.source.json`, JSON.stringify(provenance, null, 2) + '\n', { flag: 'wx', mode: 0o444 });
process.stdout.write(JSON.stringify(provenance) + '\n');
NODE
