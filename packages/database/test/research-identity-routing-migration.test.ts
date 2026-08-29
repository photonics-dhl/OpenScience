import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');
const migrationRoot = resolve(root, 'infra/migrations/20260829010000_research_identity_routing');

describe('research identity routing migration', () => {
  it('adds bounded correctable signals and a task-time context snapshot to core only', () => {
    const up = readFileSync(resolve(migrationRoot, 'migration.sql'), 'utf8');

    expect(up).toContain('ALTER TABLE "research_identity_profiles"');
    expect(up).toContain('ADD COLUMN "accepted_signals" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]');
    expect(up).toContain('ADD COLUMN "rejected_signals" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]');
    expect(up).toContain('cardinality("accepted_signals") <= 100');
    expect(up).toContain('NOT ("accepted_signals" && "rejected_signals")');
    expect(up).toContain('INSERT INTO "research_identity_profiles"');
    expect(up).toContain("ARRAY['reader'::\"ResearchIdentity\"]");
    expect(up).toContain('ON CONFLICT ("user_id") DO NOTHING');
    expect(up).toContain('ALTER TABLE "agent_tasks" ADD COLUMN "interest_context" JSONB');
    expect(up).not.toMatch(/search_chunks|search_embeddings|search_model_versions/u);
  });

  it('has a mechanical rollback for only the newly added columns and ledger row', () => {
    const down = readFileSync(resolve(migrationRoot, 'rollback.sql'), 'utf8');

    expect(down).toContain('DROP COLUMN IF EXISTS "interest_context"');
    expect(down).toContain('DROP COLUMN IF EXISTS "accepted_signals"');
    expect(down).toContain('DROP COLUMN IF EXISTS "rejected_signals"');
    expect(down).toContain("DELETE FROM \"_prisma_migrations\" WHERE \"migration_name\" = '20260829010000_research_identity_routing'");
    expect(down).not.toMatch(/DROP TABLE|DROP TYPE/u);
  });
});
