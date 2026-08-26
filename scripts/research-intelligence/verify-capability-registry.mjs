import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const allowedStatuses = new Set([
  'PRODUCTION',
  'AVAILABLE_LOCAL',
  'APPROVED_PILOT',
  'BLOCKED',
  'PATTERN_ONLY',
  'REJECTED',
]);

const tableHeader = '| Capability | Purpose | Current state | Auth/cost policy | Runtime/install boundary | Retention gate |';

function cellsFromRow(line) {
  return line.split('|').slice(1, -1).map((cell) => cell.trim());
}

export function verifyCapabilityRegistry(markdown) {
  if (/s2k-|sk-cp-/i.test(markdown)) {
    throw new Error('CREDENTIAL_SHAPED_VALUE');
  }

  const lines = markdown.split(/\r?\n/);
  const headerIndex = lines.indexOf(tableHeader);
  if (headerIndex < 0) {
    throw new Error('CAPABILITY_TABLE_MISSING');
  }

  const rows = [];
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.startsWith('|')) break;

    const cells = cellsFromRow(line);
    if (cells.length !== 6) {
      throw new Error(`BAD_COLUMN_COUNT:${cells[0] ?? 'unknown'}`);
    }
    if (cells.some((cell) => cell.length === 0)) {
      throw new Error(`INCOMPLETE_ROW:${cells[0] || 'unknown'}`);
    }

    const capability = cells[0].replaceAll('`', '');
    const statuses = cells[2]
      .replaceAll('`', '')
      .split('/')
      .map((status) => status.trim());
    if (statuses.some((status) => !allowedStatuses.has(status))) {
      throw new Error(`BAD_STATUS:${capability}`);
    }

    rows.push({ capability });
  }

  if (rows.length === 0) {
    throw new Error('CAPABILITY_TABLE_EMPTY');
  }

  return {
    rows: rows.length,
    capabilities: rows.map(({ capability }) => capability),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const markdown = await readFile('docs/runbooks/hermes-capability-registry.md', 'utf8');
  const result = verifyCapabilityRegistry(markdown);
  console.log(`HERMES_CAPABILITY_REGISTRY_OK rows=${result.rows}`);
}
