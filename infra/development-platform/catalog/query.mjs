import { readFile } from 'node:fs/promises';

// Server/container read helper for the standard catalog API. It accepts no
// arbitrary destination URL, request method, body or credential argument.
const [reader = 'codex', operation = 'entity', value = 'component:default/agent-worker'] = process.argv.slice(2);
const tokenFiles = {
  codex: '/run/secrets/codex_catalog_token',
  hermes: '/run/secrets/hermes_catalog_token',
};

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

async function main() {
  if (!Object.hasOwn(tokenFiles, reader)) throw new Error('Reader must be codex or hermes');
  let endpoint;
  if (operation === 'entity') {
    const ref = /^(component|api|system|domain|resource|group|user|location):([a-z0-9_.-]+)\/([a-z0-9_.-]+)$/i.exec(value);
    if (!ref) throw new Error('Use a full Backstage entity reference, e.g. component:default/agent-worker');
    endpoint = `/entities/by-name/${ref[1]}/${ref[2]}/${ref[3]}`;
  } else if (operation === 'list') {
    const parameters = new URLSearchParams({
      filter: value,
      fields: 'kind,metadata,spec,relations,status',
      limit: '100',
    });
    endpoint = `/entities/by-query?${parameters}`;
  } else {
    throw new Error('Operation must be entity or list');
  }

  const token = (await readFile(tokenFiles[reader], 'utf8')).trim();
  const response = await fetch(`http://127.0.0.1:3131/api/catalog${endpoint}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Catalog read returned HTTP ${response.status}`);
  process.stdout.write(`${JSON.stringify(await response.json(), null, 2)}\n`);
}

main().catch(error => fail(error.message));
