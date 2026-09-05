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

// Conservative widths wrap CJK and Latin words without removing scientific qualifiers.
function wrap(value: string, maxUnits: number): string[] {
  const lines: string[] = [];
  let line = '';
  let width = 0;
  for (const token of value.trim().split(/(\s+|[\u2e80-\uffff])/u).filter(Boolean)) {
    const units = [...token].reduce((sum, char) => sum + (char.codePointAt(0)! > 127 ? 1 : 0.65), 0);
    if (width && width + units > maxUnits && token.trim()) { lines.push(line.trimEnd()); line = ''; width = 0; }
    for (const char of token) {
      if (!line && /\s/u.test(char)) continue;
      const unit = char.codePointAt(0)! > 127 ? 1 : 0.65;
      if (width + unit > maxUnits) { lines.push(line.trimEnd()); line = ''; width = 0; }
      line += /\s/u.test(char) ? ' ' : char;
      width += unit;
    }
  }
  if (line) lines.push(line.trimEnd());
  return lines.length ? lines : [''];
}

export function canonicalPresentationClaims(claims: readonly PresentationClaim[]): PresentationClaim[] {
  return [...claims].map((claim) => ({ ...claim, conditions: [...claim.conditions].sort(), limitations: [...claim.limitations].sort() })).sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

export function presentationAssessment(value: string): string {
  const labels: Record<string, string> = { missing: 'Evidence not assessed', supported: 'Marked supported', partial: 'Marked partially supported', disputed: 'Marked disputed' };
  return labels[value] ?? value;
}

export function generateClaimChartSvg(input: readonly PresentationClaim[]): Buffer {
  const claims = canonicalPresentationClaims(input);
  let cursor = 154;
  const rows = claims.map((claim, index) => {
    const top = cursor;
    let y = top + 74;
    const text = (value: string, size: number, color: string, lineHeight: number): string => {
      const lines = wrap(value, 990 / size);
      if (y + lines.length * lineHeight + 72 > 8192) {
        throw new Error('This diagram is too long to display safely. Select fewer claims or shorten their text, conditions and limitations.');
      }
      const result = `<text x="112" y="${y}" font-size="${size}" fill="${color}">${lines.map((line, i) => `<tspan x="112" dy="${i ? lineHeight : 0}">${xml(line)}</tspan>`).join('')}</text>`;
      y += lines.length * lineHeight;
      return result;
    };
    const statement = text(claim.statement, 24, '#222c35', 36);
    let details = '';
    for (const [label, values] of [['Conditions', claim.conditions], ['Limitations', claim.limitations]] as const) {
      if (!values.length) continue;
      y += 14;
      details += text(label.toUpperCase(), 13, '#596571', 26);
      for (const value of values) details += text(value, 18, '#475563', 28);
    }
    const height = y - top + 12;
    cursor = top + height + 20;
    const kinds: Record<string, string> = { core: 'CORE CLAIM', supporting: 'SUPPORTING CLAIM', method: 'METHOD CLAIM', boundary: 'BOUNDARY CLAIM', counter: 'COUNTERCLAIM' };
    const kind = kinds[claim.kind] ?? 'RESEARCH CLAIM';
    return `<g data-claim-id="${xml(claim.id)}"><rect x="40" y="${top}" width="1120" height="${height}" rx="16" fill="#ffffff" stroke="#d9e0e5"/><circle cx="76" cy="${top + 36}" r="17" fill="#edf2f5"/><text x="76" y="${top + 42}" text-anchor="middle" font-size="15" fill="#405466">${index + 1}</text><text x="112" y="${top + 41}" font-size="13" letter-spacing="1" fill="#596571">${kind} · ${xml(presentationAssessment(claim.assessment))}</text>${statement}${details}</g>`;
  }).join('');
  const height = cursor + 40;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc" viewBox="0 0 1200 ${height}" font-family="Arial, Noto Sans CJK SC, Microsoft YaHei, sans-serif"><title id="title">Research claims</title><desc id="desc">Presentation of ${claims.length} research claims. Presentation only — not scientific evidence.</desc><rect width="1200" height="${height}" fill="#f5f7f8"/><text x="40" y="58" font-size="32" font-weight="700" fill="#222c35">Research claims</text><text x="40" y="96" font-size="17" fill="#596571">Presentation only — not scientific evidence.</text>${rows}</svg>`, 'utf8');
}
