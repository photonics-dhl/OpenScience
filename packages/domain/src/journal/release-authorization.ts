import { journalSourceMaterials } from './enhancements';

/** New releases freeze expiry. Legacy releases recover it from the retained source fingerprint. */
export function journalReleaseExpired(snapshotValue: unknown, articleSource: unknown, now = new Date()): boolean {
  const snapshot = snapshotValue as { authorization?: { expiresAt?: unknown }; source?: { textSha256?: unknown } } | null;
  if (!snapshot) return false;
  let expiry: unknown;
  if (snapshot.authorization && Object.prototype.hasOwnProperty.call(snapshot.authorization, 'expiresAt')) {
    expiry = snapshot.authorization.expiresAt;
  } else if (typeof snapshot.source?.textSha256 === 'string') {
    expiry = journalSourceMaterials(articleSource)
      .filter((material) => material.contentSha256 === snapshot.source!.textSha256)
      .map((material) => material.evidence.expiresAt)
      .filter((value): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value)))
      .sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  }
  return typeof expiry === 'string' && !Number.isNaN(Date.parse(expiry)) && new Date(expiry) <= now;
}
