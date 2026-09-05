#!/usr/bin/env node
// Default dry-run: node scripts/import-presentation-media.mjs --manifest manifest.json --file media.png [--confirm]
import { open, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { Buffer } from 'node:buffer';
import { loadApiEnv } from '@openscience/config';
import { createPrismaClient, createPrismaAuditSink } from '@openscience/database';
import { createStorageAdapter } from '@openscience/storage';
import { importReviewedPresentationMedia } from '@openscience/domain';

async function boundedFile(path, maximum) {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size > maximum) throw new Error('INVALID_FILE');
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > maximum || stat.dev !== before.dev || stat.ino !== before.ino) throw new Error('INVALID_FILE');
    const bytes = Buffer.alloc(maximum + 1);
    let length = 0;
    while (length <= maximum) {
      const { bytesRead } = await file.read(bytes, length, bytes.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > maximum) throw new Error('INVALID_FILE');
    return bytes.subarray(0, length);
  } finally { await file.close(); }
}

let prisma;
try {
  const args = process.argv.slice(2);
  const values = {};
  let confirm = false;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--confirm' && !confirm) { confirm = true; continue; }
    if (!['--manifest', '--file'].includes(flag) || values[flag] || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('INVALID_ARGUMENTS');
    values[flag] = args[++i];
  }
  if (!values['--manifest'] || !values['--file']) throw new Error('INVALID_ARGUMENTS');
  const manifest = JSON.parse((await boundedFile(values['--manifest'], 16384)).toString('utf8'));
  const fields = ['userId', 'researchObjectId', 'versionId', 'kind', 'sourceClaimIds', 'generator', 'generatorVersion', 'importRun', 'sourcePaperUrl'];
  if (!manifest || Array.isArray(manifest) || Object.keys(manifest).length !== fields.length || fields.some((field) => !(field in manifest))) throw new Error('INVALID_MANIFEST');
  const content = await boundedFile(values['--file'], 10 * 1024 * 1024);
  const env = loadApiEnv();
  prisma = createPrismaClient({ datasourceUrl: env.databaseUrl });
  const result = await importReviewedPresentationMedia({ prisma, storage: createStorageAdapter(env.storage), audit: createPrismaAuditSink(prisma) }, { ...manifest, content }, { dryRun: !confirm });
  console.log(JSON.stringify(result));
} catch (error) {
  const allowed = new Set(['NOT_FOUND', 'FORBIDDEN', 'SOURCE_CLAIM_INVALID', 'ADMIN_REQUIRED', 'VALIDATION_ERROR', 'ILLEGAL_TRANSITION', 'CONCURRENT_UPDATE']);
  console.error(allowed.has(error?.code) ? error.code : 'REVIEWED_MEDIA_IMPORT_FAILED');
  process.exitCode = 1;
} finally { await prisma?.$disconnect(); }
