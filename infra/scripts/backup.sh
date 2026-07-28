#!/usr/bin/env bash
# backup.sh — 数据库 / 对象存储每日备份（骨架，Phase 1A 填充，见 tasks P1A-*）。
#
# 安全约束（Spec §20.1-9）：
#   - 备份文件与真实用户数据不得拉入本地 Kimi/Agent 上下文；
#     备份只写远端本地盘 + 对象存储，本脚本不向 stdout 输出备份内容。
#   - 恢复流程见 docs/runbooks/backup-restore.md（恢复演练属 Spec §21.1 测试层）。
#
# 用法（Phase 1A 生效）:
#   backup.sh [--db|--storage|--all]

echo "NOT IMPLEMENTED: 将在 Phase 1A 填充（见 tasks P1A-*）" >&2
exit 64
