import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPrismaClient } from './client';
import { syncRorOrganizations, type RorRecord } from './ror-sync';

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith('--')) throw new Error(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  const file = resolve(argument('--file'));
  const datasetVersion = argument('--dataset-version');
  const stat = await import('node:fs/promises').then(({ stat }) => stat(file));
  if (stat.size > 1_000_000_000) throw new Error('ROR JSON exceeds the 1 GB safety limit');
  const parsed = JSON.parse(await readFile(file, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) throw new Error('ROR JSON root must be an array');
  const prisma = createPrismaClient();
  try {
    const result = await syncRorOrganizations(prisma, parsed as RorRecord[], { datasetVersion });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((cause: unknown) => {
  process.stderr.write(`${cause instanceof Error ? cause.message : 'ROR sync failed'}\n`);
  process.exitCode = 1;
});
