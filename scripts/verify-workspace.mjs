import { existsSync, readFileSync } from 'node:fs';

const required = [
  'apps/web/package.json',
  'apps/api/package.json',
  'apps/agent-worker/package.json',
  'apps/science-worker/package.json',
  'apps/sandbox-controller/package.json',
  'packages/domain/package.json',
  'packages/database/package.json',
  'packages/auth/package.json',
  'packages/sdf-schema/package.json',
  'packages/versioning/package.json',
  'packages/storage/package.json',
  'packages/ai-gateway/package.json',
  'packages/search/package.json',
  'packages/ui/package.json',
  'packages/config/package.json',
  'packages/observability/package.json',
  'infra/compose/.gitkeep',
  'infra/nginx/.gitkeep',
  'infra/sandbox/.gitkeep',
  'infra/scripts/.gitkeep',
  'infra/migrations/.gitkeep'
];

const missing = required.filter((p) => !existsSync(p));
if (missing.length) {
  console.error('MISSING_WORKSPACE_FILES');
  for (const p of missing) console.error(`- ${p}`);
  process.exit(1);
}

const root = JSON.parse(readFileSync('package.json', 'utf8'));
if (root.private !== true || !root.workspaces?.includes('apps/*') || !root.workspaces?.includes('packages/*')) {
  console.error('BAD_ROOT_PACKAGE');
  process.exit(1);
}
console.log('WORKSPACE_STRUCTURE_OK');
