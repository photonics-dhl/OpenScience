import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const coreUp = readFileSync(resolve(root, 'infra/migrations/20260826010000_research_intelligence_core/migration.sql'), 'utf8');
const coreDown = readFileSync(resolve(root, 'infra/migrations/20260826010000_research_intelligence_core/rollback.sql'), 'utf8');
const searchDown = readFileSync(resolve(root, 'infra/search/migrations/20260826011000_search_baseline/rollback.sql'), 'utf8');
const coreSchema = readFileSync(resolve(root, 'infra/schema.prisma'), 'utf8');

describe('Research Intelligence migration contract', () => {
  it('enforces RO/version, parent, Claim and Artifact workspace consistency in PostgreSQL', () => {
    expect(coreUp).toContain('"claim_nodes_parent_scope_fkey"');
    expect(coreUp).toContain('FOREIGN KEY ("parent_claim_id", "research_object_id", "version_id")');
    expect(coreUp).toContain('"evidence_records_claim_scope_fkey"');
    expect(coreUp).toContain('FOREIGN KEY ("claim_id", "research_object_id", "version_id")');
    expect(coreUp).toContain('"evidence_records_artifact_workspace_fkey"');
    expect(coreUp).toContain('FOREIGN KEY ("artifact_id", "workspace_id")');
    expect(coreUp).toContain('"presentation_asset_claims"');
    expect(coreUp).not.toContain('"source_claim_ids" UUID[]');
    expect(coreSchema).toContain('map: "claim_nodes_parent_scope_fkey"');
    expect(coreSchema).toContain('map: "evidence_records_claim_scope_fkey"');
    expect(coreSchema).toContain('map: "evidence_records_artifact_workspace_fkey"');
    expect(coreSchema).toContain('map: "presentation_asset_claims_claim_scope_fkey"');
  });

  it('rolls back each Prisma ledger entry so migrate deploy can re-apply', () => {
    expect(coreDown).toContain("DELETE FROM \"_prisma_migrations\" WHERE \"migration_name\" = '20260826010000_research_intelligence_core'");
    expect(searchDown).toContain("DELETE FROM \"_prisma_migrations\" WHERE \"migration_name\" = '20260826011000_search_baseline'");
  });
});
