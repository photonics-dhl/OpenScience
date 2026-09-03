import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';

const root = new URL('../', import.meta.url);

test('official ScanSci image is pinned and runs only the public MCP entrypoint', async () => {
  const [dockerfile, entrypoint, healthcheck, proxyConfig, requirements, upstreamPatch, compose, developmentCompose] = await Promise.all([
    readFile(new URL('Dockerfile', root), 'utf8'),
    readFile(new URL('entrypoint.sh', root), 'utf8'),
    readFile(new URL('healthcheck.py', root), 'utf8'),
    readFile(new URL('nginx-mcp.conf', root), 'utf8'),
    readFile(new URL('requirements.lock', root), 'utf8'),
    readFile(new URL('patch-upstream.py', root), 'utf8'),
    readFile(new URL('../../infra/compose/docker-compose.prod.yml', root), 'utf8'),
    readFile(new URL('../../infra/compose/docker-compose.dev.yml', root), 'utf8'),
  ]);

  assert.match(dockerfile, /python:3\.12-slim@sha256:7a8b475003c4fe15a2cd4e55e5cfc2f3560bdc9333d624f24cdd6d4340fd7a17/);
  assert.match(dockerfile, /pip install --no-deps --require-hashes/);
  assert.match(dockerfile, /^# syntax=docker\/dockerfile:1\.7$/m);
  assert.match(dockerfile, /COPY install-lock\.py \/opt\/scansci\/install-lock\.py/);
  assert.match(dockerfile, /python \/opt\/scansci\/install-lock\.py --lock \/opt\/scansci\/requirements\.lock --output \/tmp\/scansci-lock-blocks/);
  assert.match(dockerfile, /COPY patch-upstream\.py \/opt\/scansci\/patch-upstream\.py/);
  assert.match(dockerfile, /python \/opt\/scansci\/patch-upstream\.py/);
  assert.match(dockerfile, /for requirement in \/tmp\/scansci-lock-blocks\/\*\.txt/);
  assert.match(dockerfile, /for attempt in 1 2 3 4 5/);
  assert.match(dockerfile, /pip install --no-deps --require-hashes/);
  assert.match(dockerfile, /test "\$installed" = 1/);
  assert.match(dockerfile, /python -m pip check/);
  assert.match(dockerfile, /ARG SCANSCI_VERSION=1\.13\.1/);
  assert.match(dockerfile, /f68c30503834fc093eb192bd556090d210241eed48445017fdb3d32f6e1355e5/);
  assert.doesNotMatch(dockerfile, /COPY\s+.*scansci_pdf|PYTHONPATH/);
  assert.match(requirements, /scansci-pdf\[cloakbrowser,\s*patchright,\s*vpnsci\]==1\.13\.1/);
  assert.match(requirements, /--hash=sha256:f68c30503834fc093eb192bd556090d210241eed48445017fdb3d32f6e1355e5/);
  assert.match(requirements, /--python-platform x86_64-unknown-linux-gnu/);
  assert.match(upstreamPatch, /create_tab\("https:\/\/www\.google\.com\/", config, timeout=15\.0\)/);
  assert.match(upstreamPatch, /create_tab\("about:blank", config, timeout=15\.0\)/);
  assert.match(upstreamPatch, /browser_engine\.py/);
  assert.match(upstreamPatch, /proxy = config\.get\("browser_static_proxy", ""\)/);
  assert.match(upstreamPatch, /proxy = os\.environ\.get\("SCANSCI_PDF_PROXY"\) or config\.get\("browser_static_proxy", ""\)/);
  assert.match(upstreamPatch, /SCANSCI_PDF_SESSION_FILE/);
  assert.match(upstreamPatch, /context\.add_cookies\(_parse_netscape_cookies/);
  assert.doesNotMatch(requirements, /^pywin32==/m);
  assert.match(entrypoint, /scansci-pdf run --mode streamable_http --host 127\.0\.0\.1 --port 18080/);
  assert.ok(
    entrypoint.lastIndexOf('chmod 0770 /data/papers') > entrypoint.indexOf('install -d -m 0700'),
    'shared paper permissions must be applied after private directory initialization',
  );
  assert.match(entrypoint, /nginx -c \/opt\/scansci\/nginx-mcp\.conf -g 'daemon off;'/);
  assert.match(entrypoint, /wait -n/);
  assert.match(entrypoint, /kill "\$pid"/);
  assert.match(healthcheck, /from mcp\.client\.streamable_http import streamable_http_client/);
  assert.doesNotMatch(healthcheck, /streamablehttp_client/);
  assert.match(healthcheck, /session\.initialize\(\)/);
  assert.match(healthcheck, /session\.list_tools\(\)/);
  assert.match(healthcheck, /scansci_pdf_download/);
  assert.match(proxyConfig, /listen 8000;/);
  assert.match(proxyConfig, /proxy_pass http:\/\/127\.0\.0\.1:18080;/);
  assert.match(proxyConfig, /proxy_set_header Host 127\.0\.0\.1:18080;/);
  assert.match(proxyConfig, /proxy_buffering off;/);
  for (const directory of ['client-body', 'proxy', 'fastcgi', 'uwsgi', 'scgi']) {
    assert.match(proxyConfig, new RegExp(`/tmp/scansci-runtime/${directory}`));
  }
  assert.doesNotMatch(dockerfile, / AS auth\b|auth-entrypoint|auth-login|novnc|websockify|x11vnc/i);
  assert.ok(
    dockerfile.indexOf('LABEL org.openscience.source=') > dockerfile.indexOf('patchright install --with-deps chromium'),
    'release-dependent labels must not invalidate the browser dependency layer',
  );
  assert.equal(
    dockerfile.match(/patchright install --with-deps chromium/g)?.length,
    1,
    'the image must install exactly one Patchright Chromium runtime',
  );
  assert.match(compose, /SCANSCI_PDF_PROXY: http:\/\/openscience-egress:7891/);
  assert.match(compose, /SCANSCI_PDF_SESSION_FILE: \/data\/scansci\/publisher-session\.netscape/);
  assert.match(compose, /agent-worker:[\s\S]*?scansci-papers:\/data\/papers\n[\s\S]*?group_add:\n\s+- "11000"/);
  assert.match(compose, /scansci-mcp:[\s\S]*?group_add:\n\s+- "11000"/);
  const mcpStart = compose.indexOf('  scansci-mcp:');
  const parserStart = compose.indexOf('  document-parser:', mcpStart);
  const mcpService = compose.slice(mcpStart, parserStart);
  assert.match(mcpService, /test: \["CMD", "python", "\/opt\/scansci\/healthcheck\.py"\]/);
  assert.doesNotMatch(`${dockerfile}\n${entrypoint}`, /legal_only|SCI(?:HUB)?_ENABLED=false|TOR_ENABLED=false/i);

  const rejected = /scansci-(?:auth|legal|browser|secret-init)|auth_net|browser_net|scansci-session|scansci-service-secrets|scansci-worker-secrets|scansci-browser-(?:inputs|outputs|profiles)/i;
  assert.doesNotMatch(compose, rejected);
  assert.doesNotMatch(developmentCompose, rejected);

  await assert.rejects(access(new URL('../scansci-legal/package.json', root)));
  await assert.rejects(access(new URL('auth-entrypoint.sh', root)));
  await assert.rejects(access(new URL('auth-login.py', root)));
});
