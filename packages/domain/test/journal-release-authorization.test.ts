import { describe, expect, it } from 'vitest';
import { journalReleaseExpired } from '../src/journal/release-authorization';

const now = new Date('2026-10-09T00:00:00.000Z');
const legacy = { source: { textSha256: 'a'.repeat(64) } };
const source = { materials: [
  { contentSha256: 'a'.repeat(64), evidence: { expiresAt: '2026-10-08T00:00:00.000Z' } },
  { contentSha256: 'a'.repeat(64), evidence: { expiresAt: '2026-10-10T00:00:00.000Z' } },
  { contentSha256: 'b'.repeat(64), evidence: { expiresAt: '2026-10-01T00:00:00.000Z' } },
] };

describe('fixed journal release expiry', () => {
  it('uses the earliest matching historical source expiry', () => {
    expect(journalReleaseExpired(legacy, source, now)).toBe(true);
    expect(journalReleaseExpired({ source: { textSha256: 'c'.repeat(64) } }, source, now)).toBe(false);
  });
  it('prefers an explicit frozen authorization, including null', () => {
    expect(journalReleaseExpired({ ...legacy, authorization: { expiresAt: null } }, source, now)).toBe(false);
    expect(journalReleaseExpired({ ...legacy, authorization: { expiresAt: '2026-10-08T00:00:00.000Z' } }, {}, now)).toBe(true);
  });
});
