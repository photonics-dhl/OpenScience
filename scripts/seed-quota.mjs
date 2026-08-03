#!/usr/bin/env node
// 配额占位值 seed CLI（P1A-7）。幂等 upsert global 层 policy；重复跑不重复行。
// 用法：
//   node scripts/seed-quota.mjs [--dry-run] [--confirm]
//   --dry-run  仅打印计划不写库
//   --confirm  非 dry-run 时显式确认（与部署/迁移同纪律：询问级操作显式 --confirm）
import { PrismaClient } from '@prisma/client';
import { GLOBAL_DEFAULT_POLICIES } from '@openscience/domain';

const DEFAULT_DEV_DATABASE_URL = 'postgresql://openscience:openscience_dev@127.0.0.1:5432/openscience';
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL ?? DEFAULT_DEV_DATABASE_URL } },
});

const isDryRun = process.argv.includes('--dry-run');
const isConfirm = process.argv.includes('--confirm');

async function main() {
  if (!isDryRun && !isConfirm) {
    console.error('Usage: node scripts/seed-quota.mjs [--dry-run] [--confirm]');
    console.error('  --dry-run  仅打印计划不写库');
    console.error('  --confirm  非 dry-run 时显式确认（询问级操作）');
    process.exit(64);
  }
  for (const policy of GLOBAL_DEFAULT_POLICIES) {
    const op = isDryRun ? 'WOULD_UPSERT' : 'UPSERT';
    console.log(`${op} global ${policy.resource} = ${policy.limitValue}`);
  }
  if (isDryRun) {
    console.log(`dry-run: ${GLOBAL_DEFAULT_POLICIES.length} policies 不写库`);
    return;
  }
  let upserted = 0;
  for (const policy of GLOBAL_DEFAULT_POLICIES) {
    // Prisma upsert 复合唯一键不接受 nullable scope_key，改 findFirst + create/update（保留 null 语义）
    const existing = await prisma.quotaPolicy.findFirst({
      where: { scope: 'global', scopeKey: null, resource: policy.resource },
    });
    if (existing) {
      await prisma.quotaPolicy.update({ where: { id: existing.id }, data: { limitValue: BigInt(policy.limitValue) } });
    } else {
      await prisma.quotaPolicy.create({
        data: { scope: 'global', scopeKey: null, resource: policy.resource, limitValue: BigInt(policy.limitValue) },
      });
    }
    upserted++;
  }
  console.log(`SEEDED ${upserted}/${GLOBAL_DEFAULT_POLICIES.length} global policies`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
