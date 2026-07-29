#!/usr/bin/env node
// 邀请码管理 CLI（管理员侧最小能力，task-master 2.3）。
// 用法：
//   node scripts/invite.mjs create [--email x@y.z] [--days 30] [--by <name>]
//   node scripts/invite.mjs list
//   node scripts/invite.mjs revoke <code>
import { PrismaClient } from '@prisma/client';
import { generateInvitationCode } from '@openscience/auth';

const DEFAULT_DEV_DATABASE_URL = 'postgresql://openscience:openscience_dev@127.0.0.1:5432/openscience';
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL ?? DEFAULT_DEV_DATABASE_URL } },
});

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === 'create') {
    const days = Number(arg('--days') ?? '30');
    if (Number.isNaN(days) || days <= 0) {
      console.error('--days must be a positive number');
      process.exit(64);
    }
    const code = generateInvitationCode();
    const inv = await prisma.invitation.create({
      data: {
        code,
        email: arg('--email') ?? null,
        createdBy: arg('--by') ?? 'cli',
        expiresAt: new Date(Date.now() + days * 86400000),
      },
    });
    console.log(`CREATED ${inv.code} expires=${inv.expiresAt.toISOString()} email=${inv.email ?? '*'}`);
  } else if (cmd === 'list') {
    const rows = await prisma.invitation.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    for (const r of rows) {
      const state = r.revokedAt ? 'revoked' : r.usedBy ? 'used' : r.expiresAt <= new Date() ? 'expired' : 'active';
      console.log(`${r.code}\t${state}\t${r.email ?? '*'}\texpires=${r.expiresAt.toISOString()}`);
    }
  } else if (cmd === 'revoke') {
    const code = process.argv[3];
    if (!code) {
      console.error('Usage: node scripts/invite.mjs revoke <code>');
      process.exit(64);
    }
    const updated = await prisma.invitation.updateMany({
      where: { code, usedBy: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    console.log(updated.count ? `REVOKED ${code}` : `NOT_REVOCABLE ${code}`);
  } else {
    console.error('Usage: node scripts/invite.mjs <create|list|revoke>');
    process.exit(64);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
