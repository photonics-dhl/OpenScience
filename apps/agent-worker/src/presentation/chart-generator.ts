export interface PresentationClaim {
  id: string;
  kind: string;
  statement: string;
  assessment: string;
  conditions: string[];
  limitations: string[];
  extractionStatus: string;
}

function xml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function bounded(value: string, max = 180): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1)}…`;
}

export function canonicalPresentationClaims(claims: readonly PresentationClaim[]): PresentationClaim[] {
  return [...claims].map((claim) => ({ ...claim, conditions: [...claim.conditions].sort(), limitations: [...claim.limitations].sort() })).sort((left, right) => left.id.localeCompare(right.id));
}

export function generateClaimChartSvg(input: readonly PresentationClaim[]): Buffer {
  const claims = canonicalPresentationClaims(input);
  const height = 120 + claims.length * 116;
  const rows = claims.map((claim, index) => {
    const y = 92 + index * 116;
    const meta = [claim.kind, claim.assessment, ...claim.conditions.map((item) => `condition: ${item}`), ...claim.limitations.map((item) => `limit: ${item}`)].join(' · ');
    return `<g data-claim-id="${xml(claim.id)}"><rect x="40" y="${y}" width="1120" height="92" rx="8" fill="#f6f1e7" stroke="#817566"/><text x="64" y="${y + 34}" font-family="serif" font-size="22" fill="#292722">${xml(bounded(claim.statement))}</text><text x="64" y="${y + 67}" font-family="sans-serif" font-size="14" fill="#5f584f">${xml(bounded(meta, 220))}</text></g>`;
  }).join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc" viewBox="0 0 1200 ${height}"><title id="title">Claim evidence map</title><desc id="desc">Deterministic presentation of ${claims.length} verified claims.</desc><rect width="1200" height="${height}" fill="#fffdf8"/><text x="40" y="52" font-family="serif" font-size="30" fill="#292722">Verified claims</text>${rows}</svg>`, 'utf8');
}
