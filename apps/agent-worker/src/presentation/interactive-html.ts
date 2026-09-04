import { canonicalPresentationClaims, type PresentationClaim } from './chart-generator';

function html(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function list(label: string, values: readonly string[]): string {
  return values.length === 0 ? '' : `<section><h3>${label}</h3><ul>${values.map((value) => `<li>${html(value)}</li>`).join('')}</ul></section>`;
}

export function generateClaimInteractiveHtml(input: readonly PresentationClaim[]): Buffer {
  const claims = canonicalPresentationClaims(input);
  const items = claims.map((claim) => `<details data-claim-id="${html(claim.id)}"><summary>${html(claim.statement)}</summary><p><strong>Assessment:</strong> ${html(claim.assessment)}</p>${list('Conditions', claim.conditions)}${list('Limitations', claim.limitations)}</details>`).join('');
  return Buffer.from(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verified claims</title><style>body{margin:0;padding:2rem;background:#fffdf8;color:#292722;font:18px/1.6 serif}main{max-width:60rem;margin:auto}details{border-top:1px solid #b9ad9d;padding:1rem 0}summary{cursor:pointer;font-weight:700}h1,h3{line-height:1.2}h3{font-size:1rem;text-transform:uppercase;letter-spacing:.06em}strong{font-family:sans-serif;font-size:.85em}</style></head><body><main><h1>Verified claims</h1><p>Presentation only — not scientific evidence.</p>${items}</main></body></html>`, 'utf8');
}
