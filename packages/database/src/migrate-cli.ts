import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { DEFAULT_DEV_DATABASE_URL } from '@openscience/config';
import { assertMigrateCommandAllowed, type MigrateCommand } from './migrate-guard';

const COMMANDS: readonly MigrateCommand[] = ['deploy', 'status', 'reset-dev'];

function prismaBinPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pkgPath = require.resolve('prisma/package.json');
  return path.join(path.dirname(pkgPath), 'build', 'index.js');
}

function main(): void {
  const command = process.argv[2] as MigrateCommand | undefined;
  if (!command || !COMMANDS.includes(command)) {
    console.error(`Usage: node dist/migrate-cli.js <${COMMANDS.join('|')}>`);
    process.exit(64);
  }
  assertMigrateCommandAllowed(command, process.env.NODE_ENV);

  const repoRoot = path.join(__dirname, '..', '..', '..');
  const schema = path.join(repoRoot, 'infra', 'schema.prisma');
  const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? DEFAULT_DEV_DATABASE_URL };

  const args =
    command === 'deploy'
      ? ['migrate', 'deploy', '--schema', schema]
      : command === 'status'
        ? ['migrate', 'status', '--schema', schema]
        : ['migrate', 'reset', '--force', '--skip-generate', '--schema', schema];

  const result = spawnSync(process.execPath, [prismaBinPath(), ...args], {
    stdio: 'inherit',
    env,
  });
  if (result.error) {
    console.error(`Failed to spawn prisma: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

main();
