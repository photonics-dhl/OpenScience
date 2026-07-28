#!/usr/bin/env bash
# deploy.sh — 部署脚本（骨架，Phase 1A 填充，见 tasks P1A-*）。
#
# 部署纪律（Spec §20.5）：
#   - 部署必须通过本仓库脚本 + CI/CD 完成，禁止手工在服务器上改代码；
#   - 部署属"询问"级操作，执行前需用户确认；
#   - 不给 Agent 通用服务器写权限（只读巡检走 checkup.sh）。
#
# 详细步骤见 docs/runbooks/deployment.md。
#
# 用法（Phase 1A 生效）:
#   deploy.sh [--confirm] <release-ref>

echo "NOT IMPLEMENTED: 将在 Phase 1A 填充（见 tasks P1A-*）" >&2
exit 64
