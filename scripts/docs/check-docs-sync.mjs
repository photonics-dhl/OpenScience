// docs-sync 一致性门禁（P1E 收口教训：索引幻影条目 + AGENTS.md 失真，2026-08-06 补）
// 检查 A：project_index.md 登记的 docs/**.md 路径必须真实存在（防幻影条目）
// 检查 B：docs/{specs,plans,handoff,security,decisions,runbooks}/ 下的 .md 必须登记进 project_index.md（防漏登记）
// 检查 C：AGENTS.md 中声明的迁移区间必须与 infra/migrations/ 实际目录数一致（防 AGENTS.md 漂移）
// 用法：node scripts/docs/check-docs-sync.mjs（已挂入根 lint 与 CI）

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { validateHermesRendererIndex } from './hermes-renderer-index.mjs';

const issues = [];

// ---------- 检查 A：索引内路径存在性 ----------
const indexPath = 'project_index.md';
const indexText = readFileSync(indexPath, 'utf8');
issues.push(...validateHermesRendererIndex(indexText));
const indexedPaths = new Set();
for (const m of indexText.matchAll(/`((?:docs|infra|apps|packages|scripts)\/[^`]+?)`/g)) {
  const p = m[1];
  indexedPaths.add(p);
  if (p.endsWith('/') || p.endsWith('.md') || p.endsWith('.sql') || p.endsWith('.mjs')) {
    if (!existsSync(p)) issues.push(`A: 索引登记的路径不存在 -> ${p}`);
  }
}

// ---------- 检查 B：文档目录反向登记 ----------
const docDirs = ['docs/specs', 'docs/plans', 'docs/handoff', 'docs/security', 'docs/decisions', 'docs/runbooks'];
for (const dir of docDirs) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    const p = join(dir, f).replaceAll('\\', '/');
    if (!indexedPaths.has(p)) issues.push(`B: 文件未登记进 project_index.md -> ${p}`);
  }
}

// ---------- 检查 C：AGENTS.md 迁移区间与实际一致 ----------
const agents = readFileSync('AGENTS.md', 'utf8');
const rangeMatch = agents.match(/迁移\s*1–(\d+)/);
if (!rangeMatch) {
  issues.push('C: AGENTS.md 未找到「迁移 1–N」声明');
} else {
  const declared = Number(rangeMatch[1]);
  const actual = readdirSync('infra/migrations', { withFileTypes: true }).filter((d) => d.isDirectory()).length;
  if (declared !== actual) {
    issues.push(`C: AGENTS.md 声明迁移 1–${declared}，但 infra/migrations/ 实际有 ${actual} 个迁移`);
  }
}

// ---------- 汇总 ----------
if (issues.length) {
  console.error('DOCS_SYNC_CHECK_FAILED');
  for (const i of issues) console.error(`- ${i}`);
  process.exit(1);
}
console.log('DOCS_SYNC_OK');
