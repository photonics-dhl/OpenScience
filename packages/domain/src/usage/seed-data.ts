/**
 * P1A-7 配额占位数值（保守推测，Spec §24 待确认）。
 * 集中一处：§24 定案后改本文件即可，seed 脚本 / 运行时解析共用。
 * 仅 global 层（P1A 无用户等级；user_level scope 结构预留但无行）。
 */

export interface SeedQuotaPolicy {
  resource: string;
  limitValue: number;
}

export const GLOBAL_DEFAULT_POLICIES: readonly SeedQuotaPolicy[] = [
  { resource: 'file_size_bytes', limitValue: 50 * 1024 * 1024 }, // 50 MB 单文件大小上限
  { resource: 'storage_bytes', limitValue: 1024 * 1024 * 1024 }, // 1 GB Workspace 总容量
  { resource: 'ro_capacity_bytes', limitValue: 100 * 1024 * 1024 }, // 100 MB 单 RO 容量
  { resource: 'upload_bytes_month', limitValue: 2 * 1024 * 1024 * 1024 }, // 2 GB 月上传流量
  { resource: 'ai_credit', limitValue: 500 }, // 每月授予量（累积余额，不清零）
  { resource: 'python_task_count', limitValue: 50 }, // 月 Python 任务次数
  { resource: 'python_runtime_seconds', limitValue: 3600 }, // 月 Python 运行时长
  { resource: 'concurrent_tasks', limitValue: 2 }, // 并发任务数
];
