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
const candidateTableHeader = '| Candidate | Owner | License/source terms | Version/digest | CPU/RSS boundary | Latency/throughput | Cost boundary | Data flow | Evaluation | Kill switch | Rollback |';

function cellsFromRow(line) {
  return line.split('|').slice(1, -1).map((cell) => cell.trim());
}

function parseTable(lines, header, columnCount, name) {
  const headerIndex = lines.indexOf(header);
  if (headerIndex < 0) {
    throw new Error(`${name}_TABLE_MISSING`);
  }
  const separatorCells = cellsFromRow(lines[headerIndex + 1] ?? '');
  if (
    separatorCells.length !== columnCount
    || separatorCells.some((cell) => !/^:?-{3,}:?$/.test(cell))
  ) {
    throw new Error(`${name}_BAD_SEPARATOR`);
  }

  const rows = [];
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.startsWith('|')) break;

    const cells = cellsFromRow(line);
    if (cells.length !== columnCount) {
      throw new Error(`BAD_COLUMN_COUNT:${cells[0] ?? 'unknown'}`);
    }
    if (cells.some((cell) => cell.length === 0)) {
      throw new Error(`INCOMPLETE_ROW:${cells[0] || 'unknown'}`);
    }
    rows.push(cells);
  }

  if (rows.length === 0) {
    throw new Error(`${name}_TABLE_EMPTY`);
  }
  return rows;
}

export function verifyCapabilityRegistry(markdown) {
  if (/s2k-|sk-cp-/i.test(markdown)) {
    throw new Error('CREDENTIAL_SHAPED_VALUE');
  }

  const lines = markdown.split(/\r?\n/);
  const capabilityRows = parseTable(lines, tableHeader, 6, 'CAPABILITY');
  const rows = capabilityRows.map((cells) => {
    const capability = cells[0].replaceAll('`', '');
    const statuses = cells[2]
      .replaceAll('`', '')
      .split('/')
      .map((status) => status.trim());
    if (statuses.some((status) => !allowedStatuses.has(status))) {
      throw new Error(`BAD_STATUS:${capability}`);
    }
    return { capability, statuses };
  });

  const candidates = rows
    .filter(({ statuses }) => statuses.includes('APPROVED_PILOT'))
    .map(({ capability }) => capability);
  let candidateRows = [];
  if (candidates.length > 0) {
    candidateRows = parseTable(lines, candidateTableHeader, 11, 'CANDIDATE_EVALUATION');
    if (candidateRows.some((cells) => cells.some((cell) => /\b(?:TODO|TBD)\b/i.test(cell)))) {
      throw new Error('CANDIDATE_EVALUATION_PLACEHOLDER');
    }
    const evaluated = candidateRows.map((cells) => cells[0].replaceAll('`', ''));
    const duplicates = evaluated.filter((candidate, index) => evaluated.indexOf(candidate) !== index);
    if (duplicates.length > 0) {
      throw new Error(`DUPLICATE_CANDIDATE_EVALUATION:${duplicates[0]}`);
    }
    const missing = candidates.filter((candidate) => !evaluated.includes(candidate));
    const extra = evaluated.filter((candidate) => !candidates.includes(candidate));
    if (missing.length > 0) throw new Error(`MISSING_CANDIDATE_EVALUATION:${missing[0]}`);
    if (extra.length > 0) throw new Error(`EXTRA_CANDIDATE_EVALUATION:${extra[0]}`);
  }

  return {
    rows: rows.length,
    candidateRows: candidateRows.length,
    capabilities: rows.map(({ capability }) => capability),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const markdown = await readFile('docs/runbooks/hermes-capability-registry.md', 'utf8');
  const result = verifyCapabilityRegistry(markdown);
  console.log(`HERMES_CAPABILITY_REGISTRY_OK rows=${result.rows} candidates=${result.candidateRows}`);
}
