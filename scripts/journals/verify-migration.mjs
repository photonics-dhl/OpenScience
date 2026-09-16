import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const migrationRoot = join(repoRoot, 'infra', 'migrations');
const migrationName = '20260915000000_journals';
const prismaCli = join(repoRoot, 'node_modules', 'prisma', 'build', 'index.js');
const databaseNamePattern = /^journal_migration_test_[a-z0-9]+_[0-9a-f]{8}$/;
const expectedChecks = [
  'journal_articles_review_check',
  'journal_articles_state_check',
  'journal_grants_balance_check',
  'journal_jobs_kind_check',
  'journal_jobs_lease_check',
  'journal_jobs_state_check',
  'journal_ledger_entry_check',
  'journals_capacity_check',
];
const journalTables = [
  'journal_applications',
  'journal_articles',
  'journal_events',
  'journal_grants',
  'journal_identifiers',
  'journal_jobs',
  'journal_ledger',
  'journal_metrics',
  'journal_releases',
  'journal_service_requests',
  'journal_works',
  'journals',
];

function guardedSourceUrl() {
  const value = process.env.JOURNAL_TEST_DATABASE_URL;
  if (!value) throw new Error('JOURNAL_TEST_DATABASE_URL is required');
  const url = new URL(value);
  if (url.protocol !== 'postgresql:') throw new Error('Migration verification requires PostgreSQL');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || url.port !== '55439' || url.pathname !== '/journal_test') {
    throw new Error('Migration verification is restricted to loopback port 55439 database journal_test');
  }
  return url;
}

function temporaryDatabaseName() {
  const name = `journal_migration_test_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
  assert.match(name, databaseNamePattern);
  return name;
}

function quotedDatabaseIdentifier(name) {
  assert.match(name, databaseNamePattern);
  return `"${name}"`;
}

function databaseUrlFor(source, databaseName) {
  assert.match(databaseName, databaseNamePattern);
  const target = new URL(source);
  target.pathname = `/${databaseName}`;
  target.hash = '';
  return target.toString();
}

async function runPrisma(args, databaseUrl, cwd) {
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [prismaCli, ...args], {
      cwd,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', rejectRun);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`Prisma command failed (${signal ?? `exit ${code}`})`));
    });
  });
}

async function databaseIdentity(client) {
  const [identity] = await client.$queryRawUnsafe(`
    SELECT current_database() AS "databaseName",
           COALESCE(inet_server_addr()::text, '') AS "serverAddress",
           COALESCE(inet_server_port(), 0) AS "serverPort"
  `);
  return identity;
}

async function appliedMigrations(client) {
  return client.$queryRawUnsafe(`
    SELECT migration_name AS "migrationName"
    FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY started_at, migration_name
  `);
}

async function journalTableNames(client) {
  const rows = await client.$queryRawUnsafe(`
    SELECT tablename AS name
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'journal%'
    ORDER BY tablename
  `);
  return rows.map((row) => row.name);
}

async function oldTableCounts(client) {
  const [counts] = await client.$queryRawUnsafe(`
    SELECT (SELECT count(*)::int FROM users) AS users,
           (SELECT count(*)::int FROM workspaces) AS workspaces,
           (SELECT count(*)::int FROM memberships) AS memberships,
           (SELECT count(*)::int FROM research_objects) AS "researchObjects",
           (SELECT count(*)::int FROM sdf_documents) AS "sdfDocuments"
  `);
  return counts;
}

async function sentinelSnapshot(client, sentinel) {
  const rows = await client.$queryRawUnsafe(`
    SELECT u.id::text AS "userId", u.email::text AS email, u.display_name AS "displayName",
           w.id::text AS "workspaceId", w.type::text AS "workspaceType", w.name AS "workspaceName",
           m.role::text AS role, ro.id::text AS "researchObjectId", ro.title,
           ro.status::text AS status, ro.visibility::text AS visibility, ro.version,
           d.id::text AS "sdfDocumentId", d.core_json AS "coreJson"
    FROM users u
    JOIN workspaces w ON w.owner_id = u.id
    JOIN memberships m ON m.workspace_id = w.id AND m.user_id = u.id
    JOIN research_objects ro ON ro.workspace_id = w.id AND ro.created_by = u.id
    JOIN sdf_documents d ON d.research_object_id = ro.id
    WHERE u.id = $1::uuid AND w.id = $2::uuid AND ro.id = $3::uuid
  `, sentinel.userId, sentinel.workspaceId, sentinel.researchObjectId);
  assert.equal(rows.length, 1, 'personal Research Object sentinel is missing or duplicated');
  return rows[0];
}

async function createSentinel(client) {
  const sentinel = {
    userId: randomUUID(),
    workspaceId: randomUUID(),
    membershipId: randomUUID(),
    researchObjectId: randomUUID(),
    sdfDocumentId: randomUUID(),
  };
  const marker = randomBytes(8).toString('hex');
  await client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`
      INSERT INTO users (id, email, password_hash, display_name, status)
      VALUES ($1::uuid, $2, 'migration-test-only', $3, 'email_verified')
    `, sentinel.userId, `journal-migration-${marker}@example.invalid`, `Journal migration ${marker}`);
    await tx.$executeRawUnsafe(`
      INSERT INTO workspaces (id, type, name, owner_id)
      VALUES ($1::uuid, 'personal', $2, $3::uuid)
    `, sentinel.workspaceId, `Journal migration ${marker}`, sentinel.userId);
    await tx.$executeRawUnsafe(`
      INSERT INTO memberships (id, workspace_id, user_id, role)
      VALUES ($1::uuid, $2::uuid, $3::uuid, 'owner')
    `, sentinel.membershipId, sentinel.workspaceId, sentinel.userId);
    await tx.$executeRawUnsafe(`
      INSERT INTO research_objects (id, workspace_id, title, created_by)
      VALUES ($1::uuid, $2::uuid, $3, $4::uuid)
    `, sentinel.researchObjectId, sentinel.workspaceId, `Journal migration sentinel ${marker}`, sentinel.userId);
    await tx.$executeRawUnsafe(`
      INSERT INTO sdf_documents (id, research_object_id, core_json)
      VALUES ($1::uuid, $2::uuid, $3::jsonb)
    `, sentinel.sdfDocumentId, sentinel.researchObjectId, JSON.stringify({ migrationSentinel: marker }));
  });
  return sentinel;
}

async function verifiedCheckConstraints(client) {
  const rows = await client.$queryRawUnsafe(`
    SELECT conname AS name, convalidated AS validated, pg_get_constraintdef(oid) AS definition
    FROM pg_catalog.pg_constraint
    WHERE contype = 'c' AND conname IN (
      'journal_articles_review_check', 'journal_articles_state_check',
      'journal_grants_balance_check', 'journal_jobs_kind_check',
      'journal_jobs_lease_check', 'journal_jobs_state_check',
      'journal_ledger_entry_check', 'journals_capacity_check'
    )
    ORDER BY conname
  `);
  assert.deepEqual(rows.map((row) => row.name), expectedChecks);
  assert.ok(rows.every((row) => row.validated === true), 'journal CHECK constraints must be validated');
  assert.match(rows.find((row) => row.name === 'journal_jobs_state_check')?.definition ?? '', /'staging'/);
}

async function main() {
  const sourceUrl = guardedSourceUrl();
  const databaseName = temporaryDatabaseName();
  const targetUrl = databaseUrlFor(sourceUrl, databaseName);
  const admin = new PrismaClient({ datasources: { db: { url: sourceUrl.toString() } } });
  let target;
  let isolatedRoot;
  let created = false;
  let verificationError;
  try {
    const identity = await databaseIdentity(admin);
    assert.equal(identity.databaseName, 'journal_test');
    assert.equal(identity.serverPort, 55439);
    assert.ok(
      ['127.0.0.1', '::1'].includes(identity.serverAddress.split('/', 1)[0]),
      `database server is not loopback (${identity.serverAddress})`,
    );

    await admin.$executeRawUnsafe(`CREATE DATABASE ${quotedDatabaseIdentifier(databaseName)}`);
    created = true;

    isolatedRoot = await mkdtemp(join(tmpdir(), 'openscience-journal-migration-'));
    const resolvedTemp = resolve(isolatedRoot);
    const tempPrefix = `${resolve(tmpdir())}${sep}`;
    assert.ok(resolvedTemp.startsWith(tempPrefix) && dirname(resolvedTemp) === resolve(tmpdir()));
    const isolatedSchema = join(isolatedRoot, 'schema.prisma');
    const isolatedMigrations = join(isolatedRoot, 'migrations');
    await cp(join(repoRoot, 'infra', 'schema.prisma'), isolatedSchema);
    await cp(migrationRoot, isolatedMigrations, { recursive: true });

    const migrationDirectories = await readdir(isolatedMigrations, { withFileTypes: true });
    const names = migrationDirectories.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    assert.equal(names.length, 37, 'expected the complete 1-37 migration chain');
    assert.equal(names.at(-1), migrationName, 'journal migration must be migration 37 and the latest migration');

    await runPrisma(['migrate', 'deploy', '--schema', isolatedSchema], targetUrl, isolatedRoot);
    target = new PrismaClient({ datasources: { db: { url: targetUrl } } });
    const targetIdentity = await databaseIdentity(target);
    assert.equal(targetIdentity.databaseName, databaseName);
    assert.equal(targetIdentity.serverPort, 55439);
    assert.deepEqual((await appliedMigrations(target)).map((row) => row.migrationName), names);
    assert.deepEqual(await journalTableNames(target), journalTables);

    const sentinel = await createSentinel(target);
    const snapshotBefore = await sentinelSnapshot(target, sentinel);
    const countsBefore = await oldTableCounts(target);

    const rollbackFile = join(isolatedMigrations, migrationName, 'rollback.sql');
    assert.ok((await readFile(rollbackFile, 'utf8')).trim().length > 0, 'migration 37 rollback.sql is empty');
    await runPrisma(['db', 'execute', '--schema', isolatedSchema, '--file', rollbackFile], targetUrl, isolatedRoot);
    assert.deepEqual(await journalTableNames(target), []);
    assert.deepEqual(await sentinelSnapshot(target, sentinel), snapshotBefore);
    assert.deepEqual(await oldTableCounts(target), countsBefore);

    const removed = await target.$executeRawUnsafe(
      'DELETE FROM "_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL',
      migrationName,
    );
    assert.equal(removed, 1, 'expected one applied migration 37 ledger row');
    await runPrisma(['migrate', 'deploy', '--schema', isolatedSchema], targetUrl, isolatedRoot);
    assert.deepEqual((await appliedMigrations(target)).map((row) => row.migrationName), names);
    assert.deepEqual(await journalTableNames(target), journalTables);
    await verifiedCheckConstraints(target);
    assert.deepEqual(await sentinelSnapshot(target, sentinel), snapshotBefore);
    assert.deepEqual(await oldTableCounts(target), countsBefore);

    console.log('JOURNAL_MIGRATION_VERIFIED migrations=37 rollback=preserved reapply=checked');
  } catch (error) {
    verificationError = error;
  }

  const cleanupErrors = [];
  try { await target?.$disconnect(); } catch (error) { cleanupErrors.push(error); }
  if (created) {
    try {
      assert.match(databaseName, databaseNamePattern);
      await admin.$executeRawUnsafe(`DROP DATABASE ${quotedDatabaseIdentifier(databaseName)} WITH (FORCE)`);
      const [remaining] = await admin.$queryRawUnsafe(
        'SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS present',
        databaseName,
      );
      assert.equal(remaining?.present, false, 'temporary migration database was not dropped');
    } catch (error) { cleanupErrors.push(error); }
  }
  try { await admin.$disconnect(); } catch (error) { cleanupErrors.push(error); }
  if (isolatedRoot) {
    try {
      const resolvedTemp = resolve(isolatedRoot);
      assert.ok(resolvedTemp.startsWith(`${resolve(tmpdir())}${sep}`)
        && dirname(resolvedTemp) === resolve(tmpdir())
        && resolvedTemp.split(sep).at(-1)?.startsWith('openscience-journal-migration-'));
      await rm(resolvedTemp, { recursive: true });
    } catch (error) { cleanupErrors.push(error); }
  }
  if (verificationError && cleanupErrors.length) {
    throw new AggregateError([verificationError, ...cleanupErrors], 'migration verification and cleanup failed');
  }
  if (verificationError) throw verificationError;
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'migration verification cleanup failed');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'JOURNAL_MIGRATION_VERIFICATION_FAILED');
  process.exitCode = 1;
});
