import type { Prisma, PrismaClient } from '@prisma/client';

const ROR_ID = /^https:\/\/ror\.org\/0[0-9a-hj-km-np-tv-z]{6}[0-9]{2}$/;
const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export interface RorRecord {
  id?: unknown;
  status?: unknown;
  domains?: unknown;
  types?: unknown;
  names?: unknown;
  locations?: unknown;
  admin?: unknown;
}

export interface NormalizedRorOrganization {
  rorId: string;
  name: string;
  countryCode: string | null;
  types: string[];
  domains: string[];
  status: 'active' | 'inactive' | 'withdrawn';
  sourceUpdatedAt: Date | null;
  metadata: Prisma.InputJsonObject;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function normalizeInstitutionDomain(value: string): string | null {
  const domain = value.trim().toLowerCase().replace(/^@/, '').replace(/\.$/, '');
  return DOMAIN.test(domain) ? domain : null;
}

export function normalizeRorRecord(input: RorRecord): NormalizedRorOrganization | null {
  if (typeof input.id !== 'string' || !ROR_ID.test(input.id)) return null;
  if (input.status !== 'active' && input.status !== 'inactive' && input.status !== 'withdrawn') return null;
  const names = Array.isArray(input.names) ? input.names : [];
  const nameEntries = names.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object');
  const preferred = nameEntries.find((entry) => Array.isArray(entry.types) && entry.types.includes('ror_display'))
    ?? nameEntries.find((entry) => Array.isArray(entry.types) && entry.types.includes('label'));
  if (!preferred || typeof preferred.value !== 'string' || !preferred.value.trim()) return null;
  const locations = Array.isArray(input.locations) ? input.locations : [];
  const primaryLocation = locations.find((entry) => Boolean(entry) && typeof entry === 'object') as Record<string, unknown> | undefined;
  const details = primaryLocation?.geonames_details as Record<string, unknown> | undefined;
  const countryCode = typeof details?.country_code === 'string' && /^[A-Z]{2}$/.test(details.country_code)
    ? details.country_code
    : null;
  const admin = input.admin && typeof input.admin === 'object' ? input.admin as Record<string, unknown> : {};
  const lastModified = admin.last_modified && typeof admin.last_modified === 'object'
    ? admin.last_modified as Record<string, unknown>
    : {};
  const sourceUpdatedAt = typeof lastModified.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(lastModified.date)
    ? new Date(`${lastModified.date}T00:00:00.000Z`)
    : null;
  return {
    rorId: input.id,
    name: preferred.value.trim(),
    countryCode,
    types: [...new Set(strings(input.types).map((value) => value.trim().toLowerCase()).filter(Boolean))].sort(),
    domains: [...new Set(strings(input.domains).map(normalizeInstitutionDomain).filter((value): value is string => Boolean(value)))].sort(),
    status: input.status,
    sourceUpdatedAt,
    metadata: { schemaVersion: typeof lastModified.schema_version === 'string' ? lastModified.schema_version : 'unknown' },
  };
}

export async function syncRorOrganizations(
  prisma: PrismaClient,
  records: RorRecord[],
  options: { datasetVersion: string; syncedAt?: Date },
): Promise<{ accepted: number; rejected: number; withDomains: number }> {
  if (!options.datasetVersion.trim()) throw new Error('ROR dataset version is required');
  if (records.length > 250_000) throw new Error('ROR dataset exceeds the 250000-record safety limit');
  const normalized = records.map(normalizeRorRecord);
  const accepted = normalized.filter((record): record is NormalizedRorOrganization => Boolean(record));
  const syncedAt = options.syncedAt ?? new Date();
  const batchSize = 250;
  for (let offset = 0; offset < accepted.length; offset += batchSize) {
    const batch = accepted.slice(offset, offset + batchSize);
    await prisma.$transaction(batch.map((record) => prisma.researchOrganization.upsert({
      where: { rorId: record.rorId },
      create: { ...record, datasetVersion: options.datasetVersion, syncedAt },
      update: { ...record, datasetVersion: options.datasetVersion, syncedAt },
    })));
  }
  return {
    accepted: accepted.length,
    rejected: records.length - accepted.length,
    withDomains: accepted.filter((record) => record.domains.length > 0).length,
  };
}
