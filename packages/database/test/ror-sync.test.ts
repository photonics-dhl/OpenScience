import { describe, expect, it } from 'vitest';
import { normalizeInstitutionDomain, normalizeRorRecord, syncRorOrganizations } from '../src/ror-sync';

/* eslint-disable @typescript-eslint/no-explicit-any -- focused Prisma fake covers only the importer boundary */

const RECORD = {
  id: 'https://ror.org/00tjv0s33',
  status: 'active',
  domains: ['Example.EDU', 'invalid domain'],
  types: ['Education'],
  names: [{ value: 'Example University', types: ['ror_display'] }],
  locations: [{ geonames_details: { country_code: 'US' } }],
  admin: { last_modified: { date: '2026-08-01', schema_version: '2.1' } },
};

describe('ROR organization sync', () => {
  it('normalizes official schema v2 records and rejects unsafe domains', () => {
    expect(normalizeInstitutionDomain('@Sub.Example.EDU.')).toBe('sub.example.edu');
    expect(normalizeInstitutionDomain('not a domain')).toBeNull();
    expect(normalizeRorRecord(RECORD)).toMatchObject({
      rorId: RECORD.id,
      name: 'Example University',
      countryCode: 'US',
      status: 'active',
      domains: ['example.edu'],
      types: ['education'],
    });
  });

  it('upserts bounded batches with an explicit dataset version', async () => {
    const writes: any[] = [];
    const prisma: any = {
      researchOrganization: { upsert: (input: any) => { writes.push(input); return Promise.resolve(input); } },
      $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    };
    await expect(syncRorOrganizations(prisma, [RECORD, { id: 'bad' }], {
      datasetVersion: 'v2.7-2026-08-20', syncedAt: new Date('2026-09-02T00:00:00Z'),
    })).resolves.toEqual({ accepted: 1, rejected: 1, withDomains: 1 });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      where: { rorId: RECORD.id },
      create: { datasetVersion: 'v2.7-2026-08-20', domains: ['example.edu'] },
    });
  });
});
