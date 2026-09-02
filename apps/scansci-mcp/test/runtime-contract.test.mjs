import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('official ScanSci image is pinned and runs only the public MCP entrypoint', async () => {
  const [dockerfile, entrypoint, requirements] = await Promise.all([
    readFile(new URL('Dockerfile', root), 'utf8'),
    readFile(new URL('entrypoint.sh', root), 'utf8'),
    readFile(new URL('requirements.lock', root), 'utf8'),
  ]);

  assert.match(dockerfile, /python:3\.12-slim@sha256:7a8b475003c4fe15a2cd4e55e5cfc2f3560bdc9333d624f24cdd6d4340fd7a17/);
  assert.match(dockerfile, /pip install --require-hashes/);
  assert.match(dockerfile, /ARG SCANSCI_VERSION=1\.13\.1/);
  assert.match(dockerfile, /f68c30503834fc093eb192bd556090d210241eed48445017fdb3d32f6e1355e5/);
  assert.doesNotMatch(dockerfile, /COPY\s+.*scansci_pdf|PYTHONPATH/);
  assert.match(requirements, /scansci-pdf\[cloakbrowser,\s*patchright,\s*vpnsci\]==1\.13\.1/);
  assert.match(requirements, /--hash=sha256:f68c30503834fc093eb192bd556090d210241eed48445017fdb3d32f6e1355e5/);
  assert.match(entrypoint, /scansci-pdf run --mode streamable_http --host 0\.0\.0\.0 --port 8000/);
  assert.doesNotMatch(`${dockerfile}\n${entrypoint}`, /legal_only|SCI(?:HUB)?_ENABLED=false|TOR_ENABLED=false/i);
});
