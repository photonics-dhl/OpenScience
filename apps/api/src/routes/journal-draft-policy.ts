/** Callers must recheck membership and revision inside the journal transaction. */
export function draftDeletionBlock(input: {
  contentState: string;
  reviewState: string;
  releaseCount: number;
  activeJobCount: number;
}): string | null {
  if (input.contentState !== 'active') return '受限或撤回论文不可删除草稿。';
  if (input.releaseCount > 0) return '当前修订已经公开，请先创建新的私有修订。';
  if (input.activeJobCount > 0) return '论文正在处理中，请等待处理结束或先取消任务。';
  if (['submitted', 'approved'].includes(input.reviewState)) return '论文已进入审批流程，不能直接删除草稿。';
  return null;
}
export function archivedAtRevision(after: unknown, revision: number): boolean {
  return !!after && typeof after === 'object' && !Array.isArray(after) &&
    (after as { revision?: unknown }).revision === revision;
}
