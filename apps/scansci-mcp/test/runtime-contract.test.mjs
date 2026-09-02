import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('official ScanSci image is pinned and runs only the public MCP entrypoint', async () => {
  const [dockerfile, entrypoint, authEntrypoint, proxyConfig, requirements, compose] = await Promise.all([
    readFile(new URL('Dockerfile', root), 'utf8'),
    readFile(new URL('entrypoint.sh', root), 'utf8'),
    readFile(new URL('auth-entrypoint.sh', root), 'utf8'),
    readFile(new URL('nginx-mcp.conf', root), 'utf8'),
    readFile(new URL('requirements.lock', root), 'utf8'),
    readFile(new URL('../../infra/compose/docker-compose.prod.yml', root), 'utf8'),
  ]);

  assert.match(dockerfile, /python:3\.12-slim@sha256:7a8b475003c4fe15a2cd4e55e5cfc2f3560bdc9333d624f24cdd6d4340fd7a17/);
  assert.match(dockerfile, /pip install --require-hashes/);
  assert.match(dockerfile, /ARG SCANSCI_VERSION=1\.13\.1/);
  assert.match(dockerfile, /f68c30503834fc093eb192bd556090d210241eed48445017fdb3d32f6e1355e5/);
  assert.doesNotMatch(dockerfile, /COPY\s+.*scansci_pdf|PYTHONPATH/);
  assert.match(requirements, /scansci-pdf\[cloakbrowser,\s*patchright,\s*vpnsci\]==1\.13\.1/);
  assert.match(requirements, /--hash=sha256:f68c30503834fc093eb192bd556090d210241eed48445017fdb3d32f6e1355e5/);
  assert.match(requirements, /--python-platform x86_64-unknown-linux-gnu/);
  assert.doesNotMatch(requirements, /^pywin32==/m);
  assert.match(entrypoint, /scansci-pdf run --mode streamable_http --host 127\.0\.0\.1 --port 18080/);
  assert.ok(
    entrypoint.lastIndexOf('chmod 0770 /data/papers') > entrypoint.indexOf('install -d -m 0700'),
    'shared paper permissions must be applied after private directory initialization',
  );
  assert.match(entrypoint, /nginx -c \/opt\/scansci\/nginx-mcp\.conf -g 'daemon off;'/);
  assert.match(proxyConfig, /listen 8000;/);
  assert.match(proxyConfig, /proxy_pass http:\/\/127\.0\.0\.1:18080;/);
  assert.match(proxyConfig, /proxy_set_header Host 127\.0\.0\.1:18080;/);
  assert.match(proxyConfig, /proxy_buffering off;/);
  for (const directory of ['client-body', 'proxy', 'fastcgi', 'uwsgi', 'scgi']) {
    assert.match(proxyConfig, new RegExp(`/tmp/scansci-runtime/${directory}`));
  }
  assert.match(authEntrypoint, /Xvfb "\$DISPLAY" -screen 0 1280x800x24 -nolisten tcp/);
  assert.match(authEntrypoint, /x11vnc .* -listen 127\.0\.0\.1 .* -nopw/);
  assert.match(authEntrypoint, /websockify --web=\/usr\/share\/novnc 0\.0\.0\.0:6080 127\.0\.0\.1:5900/);
  assert.match(authEntrypoint, /scansci-pdf federated-login sciencedirect --force/);
  assert.doesNotMatch(authEntrypoint, /scansci_legal|legal_only/i);
  assert.ok(
    dockerfile.indexOf('LABEL org.openscience.source=') > dockerfile.indexOf('patchright install --with-deps chromium'),
    'release-dependent labels must not invalidate the browser dependency layer',
  );
  assert.match(compose, /SCANSCI_PDF_PROXY: http:\/\/openscience-egress:7891/);
  assert.match(compose, /agent-worker:[\s\S]*?scansci-papers:\/data\/papers\n[\s\S]*?group_add:\n\s+- "11000"/);
  assert.match(compose, /scansci-mcp:[\s\S]*?group_add:\n\s+- "11000"/);
  const authStart = compose.indexOf('  scansci-auth:');
  const parserStart = compose.indexOf('  document-parser:', authStart);
  assert.ok(authStart >= 0 && parserStart > authStart);
  const authService = compose.slice(authStart, parserStart);
  assert.match(authService, /context: \$\{XGS_RELEASE_ROOT:\?XGS_RELEASE_ROOT required\}\/apps\/scansci-mcp/);
  assert.match(authService, /target: auth/);
  assert.match(authService, /- scansci-data:\/data\/scansci/);
  assert.match(authService, /- "127\.0\.0\.1:6080:6080"/);
  assert.doesNotMatch(authService, /env_file|scansci-session|scansci_legal|legal_only/i);
  assert.doesNotMatch(`${dockerfile}\n${entrypoint}`, /legal_only|SCI(?:HUB)?_ENABLED=false|TOR_ENABLED=false/i);
});
