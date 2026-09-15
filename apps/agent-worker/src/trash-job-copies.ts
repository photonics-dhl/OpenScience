import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { lstat, open, readdir, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { PrismaClient } from '@prisma/client';
import { TrashError, type TrashSearchScope } from '@openscience/domain';

function pending(message: string): never { throw new TrashError('CLEANUP_PENDING', message); }
async function regularJson(path: string, maxBytes = 2 * 1024 * 1024): Promise<unknown> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > maxBytes) pending('任务副本记录暂不可安全读取');
    return JSON.parse(await file.readFile('utf8')) as unknown;
  } finally { await file.close(); }
}
async function exists(path: string) {
  try { await lstat(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
async function parserCopies(directory: string | undefined, artifactIds: string[], contentHashes: Set<string>): Promise<void> {
  if (!artifactIds.length) return;
  if (!directory) pending('解析任务目录暂未接入，等待服务器清理');
  const root = resolve(directory);
  if (!isAbsolute(directory)) pending('解析任务目录配置不可用');
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') pending('解析任务卷暂不可用，等待服务器清理'); throw error; }
  const artifacts = new Set(artifactIds);
  for (const entry of entries) {
    const match = /^([0-9a-f-]{36})\.(request|processing|response)\.json$/iu.exec(entry.name);
    if (!match || !entry.isFile()) continue;
    const path = join(root, entry.name);
    const stat = await lstat(path);
    const limit = match[2] === 'response' ? 24 * 1024 * 1024 : 2 * 1024 * 1024;
    if (stat.size > limit) pending('解析副本超出协议大小，需服务器定位后清理');
    let value: unknown;
    try { value = await regularJson(path, limit); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    if (typeof row.artifactId !== 'string' || !artifacts.has(row.artifactId)) continue;
    const id = match[1]!;
    const cancellation = join(root, `${id}.cancelled`);
    try { await writeFile(cancellation, '', { flag: 'wx', mode: 0o644 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    if (await exists(join(root, `${id}.processing.json`))) pending('解析器正在结束已取消任务，清除将继续');
    await rm(join(root, `${id}.request.json`), { force: true });
    if (await exists(join(root, `${id}.processing.json`))) pending('解析器正在结束已取消任务，清除将继续');
    for (const suffix of ['input','response.tmp','response.json']) {
      const target = resolve(root, `${id}.${suffix}`);
      if (!target.startsWith(root + sep)) pending('解析副本路径不可用');
      await rm(target, { force: true });
    }
    // Keep the empty cancellation marker until the existing orphan reaper removes it.
  }
  for (const entry of entries) {
    const match = /^([0-9a-f-]{36})\.input$/iu.exec(entry.name);
    if (!match || !entry.isFile()) continue;
    const id = match[1]!, path = join(root, entry.name);
    if (await exists(join(root, `${id}.request.json`)) || await exists(join(root, `${id}.processing.json`))) continue;
    let file;
    try { file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    let digest: string;
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 128 * 1024 * 1024) pending('解析孤立副本超出可识别范围');
      const hash = createHash('sha256');
      for await (const chunk of file.createReadStream({ autoClose: false })) hash.update(chunk);
      digest = hash.digest('hex');
    } finally { await file.close(); }
    if (!contentHashes.has(digest)) continue;
    try { await writeFile(join(root, `${id}.cancelled`), '', { flag: 'wx', mode: 0o644 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    if (await exists(join(root, `${id}.request.json`)) || await exists(join(root, `${id}.processing.json`))) pending('解析器正在结束任务，清除将继续');
    await rm(path, { force: true });
    await rm(join(root, `${id}.response.tmp`), { force: true });
    await rm(join(root, `${id}.response.json`), { force: true });
  }
}

/** Send IDs only to the host-owned eraser; provider-result mounts remain read-only. */
export function createPrivateJobCopyCleanup(prisma: PrismaClient, env: NodeJS.ProcessEnv) {
  return async (scope: TrashSearchScope): Promise<void> => {
    const sources = await prisma.artifact.findMany({ where: { id: { in: scope.artifactIds } }, select: { blobSha256: true } });
    await parserCopies(env.PARSER_JOB_DIR, scope.artifactIds, new Set(sources.map(source => source.blobSha256)));
    const inbox = env.PRIVATE_CLEANUP_INBOX_DIR, results = env.PRIVATE_CLEANUP_RESULTS_DIR;
    if (!inbox || !results || !isAbsolute(inbox) || !isAbsolute(results)) pending('等待服务器清理执行器接入');
    for (const directory of [inbox, results]) { const stat = await lstat(directory); if (!stat.isDirectory() || stat.isSymbolicLink()) pending('清理执行器目录暂不可用'); }
    const id = scope.trashEntryId;
    if (!/^[0-9a-f-]{36}$/iu.test(id)) pending('清理项目标识无效');
    const request = join(inbox, `${id}.json`);
    try { await writeFile(request, JSON.stringify(scope), { flag: 'wx', mode: 0o600 }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (!isDeepStrictEqual(await regularJson(request, 1024 * 1024), scope)) pending('清理范围记录不一致，等待服务器处理');
    }
    const receipt = join(results, `${id}.json`);
    if (!await exists(receipt)) pending('服务器正在清理生成与解析副本');
    const value = await regularJson(receipt, 1024 * 1024);
    const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    if (row.schemaVersion !== 1 || row.id !== id || !isDeepStrictEqual(row.scope, scope) || row.state !== 'complete') pending('服务器副本清理尚未完成，将自动重试');
  };
}
