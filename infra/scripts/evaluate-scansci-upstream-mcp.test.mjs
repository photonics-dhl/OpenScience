import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const script = join(root, 'infra/scripts/evaluate-scansci-upstream-mcp.sh');
const gitBash = process.env.XGS_GIT_BASH || 'C:\\Program Files\\Git\\bin\\bash.exe';

test('runs the official MCP positive journey and exact cleanup', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'xgs-scansci-mcp-eval-'));
  const calls = join(fixture, 'docker.calls');
  const state = join(fixture, 'container.running');
  const docker = join(fixture, 'docker');
  writeFileSync(docker, `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" >> "$SCANSCI_TEST_CALLS"
if [ "\${1:-}" = container ] && [ "\${2:-}" = inspect ]; then
  test -f "$SCANSCI_TEST_STATE"
  exit
fi
if [ "\${1:-}" = volume ] && [ "\${2:-}" = inspect ]; then
  exit 1
fi
if [ "\${1:-}" = run ]; then
  : > "$SCANSCI_TEST_STATE"
  printf '%s\\n' test-container-id
  exit
fi
if [ "\${1:-}" = rm ]; then
  rm -f "$SCANSCI_TEST_STATE"
  exit
fi
if [ "\${1:-}" = exec ]; then
  cat <<'EOF'
SCANSCI_VERSION=1.13.1
SCANSCI_TOOLS=scansci_pdf_batch_download,scansci_pdf_cache_clear,scansci_pdf_channel_status,scansci_pdf_citation,scansci_pdf_config,scansci_pdf_diagnostics,scansci_pdf_download,scansci_pdf_elsevier_setup,scansci_pdf_expand_citations,scansci_pdf_find,scansci_pdf_login,scansci_pdf_parse_list,scansci_pdf_prepare_queue,scansci_pdf_schools,scansci_pdf_search,scansci_pdf_tor,scansci_pdf_zotero_push
SCANSCI_SOURCE=arXiv
SCANSCI_PDF_MAGIC=%PDF-
SCANSCI_PDF_BYTES=24671920
SCANSCI_PDF_SHA256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
EOF
fi
`, 'utf8');
  chmodSync(docker, 0o755);

  const result = spawnSync(gitBash, [script, '--confirm'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fixture}${delimiter}${process.env.PATH ?? ''}`,
      SCANSCI_TEST_CALLS: calls,
      SCANSCI_TEST_STATE: state,
      SCANSCI_EVAL_SUFFIX: 'contract',
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /SCANSCI_VERSION=1\.13\.1/);
  assert.match(result.stdout, /SCANSCI_PDF_MAGIC=%PDF-/);
  assert.doesNotMatch(result.stdout, /cookie|password|authorization/i);

  const invoked = readFileSync(calls, 'utf8');
  assert.match(invoked, /volume create openscience-eval-scansci-mcp-contract/);
  assert.match(invoked, /run -d --name openscience-eval-scansci-mcp-contract --network host/);
  assert.match(invoked, /scansci-pdf==1\.13\.1/);
  assert.match(invoked, /f68c30503834fc093eb192bd556090d210241eed48445017fdb3d32f6e1355e5/);
  assert.match(invoked, /-e NO_PROXY=localhost,127\.0\.0\.1/);
  assert.match(invoked, /scansci-pdf run --mode streamable_http --host 127\.0\.0\.1 --port 18081/);
  assert.match(invoked, /exec openscience-eval-scansci-mcp-contract python -c/);
  assert.doesNotMatch(invoked, /legal_only|scihub_enabled|use_tor/);
  assert.match(invoked, /rm -f openscience-eval-scansci-mcp-contract/);
  assert.match(invoked, /volume rm openscience-eval-scansci-mcp-contract/);
});
