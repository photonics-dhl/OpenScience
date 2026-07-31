# Handoff — 2026-07-31 P1A-2/3/4 云上收口完成，平台底座剩 2.5–2.9

- Current goal: Phase 1A 平台底座。P1A-2/3/4 已全链路闭环（本地门禁 + 云上集成测试），下一任务 P1A-5 RBAC 权限矩阵（task-master 2.5，先 design gate）。
- Done:
  - 云上集成测试 9/9 全绿：`cd /opt/openscience && npx pnpm@9.15.0 test:integration`（database 2 + storage 1 + api 6，含真实 PG 并发双 accept 竞态用例）；task-master 2.2/2.3/2.4/2.10 置 done
  - 云环境就绪：Alibaba Cloud Linux 4，Node 22.23 + docker compose 2.26 + nginx 1.30 + acme.sh v3.1.3（gitee 镜像安装）+ cronie；代码 `/opt/openscience`（tar-over-ssh 同步，排除 .env/.git）
  - 迁移 1–3 云上已 deploy；dev 栈（postgres/redis/minio）运行中，端口仅 127.0.0.1
  - DNS + 面板：`OpenScience.428312321.xyz`、`portainer.428312321.xyz` → 公网 IP（Cloudflare DNS-only）；Portainer 经 nginx 443 反代 + LE 证书自动续期，`https://portainer.428312321.xyz` 直达
  - 密钥卫生：`.mcp.json` 移出 git 跟踪（.gitignore 补两条）；项目专用 SSH 密钥 `~/.ssh/id_ed25519_xgs` + `~/.ssh/config` Host 条目（IP + 域名别名）
  - VS Code MCP：task-master-ai 入 root devDependencies，`.vscode/mcp.json` 直连 node_modules 入口（绕开 npm 11.6.1 npx --package bug）
  - 提交：`1efd327`（P1A-4 实现）`418e4c9`（集成测试修复）`88b8103`（密钥移出 git）`d900c97`（devDeps）`36fa21b`（nginx + 文档），已全部 push origin/main
- Constraints: 不读/打印 `.env`；git mutation 逐次用户批准；pnpm 一律 `npx pnpm@9.15.0`；本机不做 Docker；云上写操作前用户确认；主模型 MiniMax-M3、回退配置化；集成测试只在云上跑（新环境先 build database 让 prisma generate 先跑）。
- Open risks:
  - MiniMax 代理 key 曾在 `ce9da28` 历史提交中推送 GitHub（已停止跟踪，但历史仍在）——建议轮换，用户已知悉暂未处理
  - 服务器实例密码在对话中出现过明文，建议阿里云控制台轮换
  - `.worktrees/p1a-1` 残留未清；P1A-3 终审 parked 项（见 progress.md 2026-07-28 条目）
  - 云上代码与仓同步目前靠手动 tar-over-ssh；CI/CD 归 task 2.9
- Next action: P1A-5 RBAC 权限矩阵（task-master 2.5）：brainstorming → design spec（用户逐节确认）→ writing-plans。
- Read first: `AGENTS.md` → `docs/OpenScience_Kimi_Development_Spec.md` → ADR-001/002 → `docs/progress.md`（2026-07-31 两条目）→ `project_index.md` → task-master 任务 2 → Memory 实体 `XGS-*`。
