# 本机 Codex Web GPT 桌面续接补丁

## 当前可复用的 CLI 合作入口

`collaborate.mjs` 沿用已经实际成功的原生 CLI 自动审批方式，固定续接本项目 Pro 任务；任务正文从 UTF-8 文件经 STDIN 传入，不修改共享桥或全局权限。以项目根为工作目录运行：

```powershell
node infra/development-platform/codex-chatgpt-web/collaborate.mjs tmp/<任务文件>.txt <已安装codex.exe的绝对路径>
```

分配有明确文件边界的短任务，并核对真实工具输出和文件读回。CLI exit0 仅表示进程结束：2026-09-21 长任务前半段实际完成源码读取，后半段工具入口不可用，报告没有写出，不能记成完成。

日志位于 ignored `tmp/pro-collaboration/`，stdout JSONL 与 stderr 分开保存。Windows 的文件 mode 0600 不构成 ACL 保证：当前主机该目录已设置受保护 ACL，仅当前用户、SYSTEM、Administrators 可访问，原目录 SDDL 留存。其他 checkout 使用前须按其实际日志访问需求设置并核对目录 ACL，不复制账号或凭据。

同一任务用排他文件锁避免同时续接；只有 CLI exit0 且日志写完才自动移除锁。异常或中断保留锁和收据，先查锁中 PID、对应 CLI 是否结束以及原任务结果，再由操作者决定是否解除；不要仅凭文件时间删除锁或重发任务。当前入口不依赖下方尚未安装的 Desktop 续接补丁。

这是独立本机工具的候选修复，不属于 OpenScience 服务器 image provider。当前启用状态只见 [CURRENT](../../../docs/handoff/2026-09-10-hermes-web-image-handoff.md)；不能由补丁存在推断已安装或 Full 实跑成功。

`desktop-continuation.patch` 基于 [codex-chatgpt-web v5.0.8](https://github.com/miuuyy/codex-chatgpt-web/tree/00aab23eb78a0d35ab575ff14044e29c0f80e711)，base `00aab23eb78a0d35ab575ff14044e29c0f80e711`，包含四个源码文件与一个定向测试文件。保留上游 MIT 许可 `LICENSE.upstream`。本地候选提交为 `84e6997`，不是上游发布。

修复范围：

- 统一识别当前原生 turn 的 `create_thread` / `send_message_to_thread` 完整 delegation；有类型元数据的 plugins/AGENTS/environment 前言不再充当用户指令。
- 环境配对可跨越经过来源核对的压缩项；只有实际跨越的路径要求当前原生 rollout 的 cwd、roots、写权限与沙箱/网络一致。
- 原指令被压缩移除后，只由当前进程确实完成的同 thread/turn/model/effort、同摘要 checkpoint 恢复原指令及 item ID。新指令优先，无效新委派不能复活旧任务。内存记录沿用原有 256 项上限，不持久化权限凭证。
- v1/v2 producer 保留各自真实来源，不要求 delegation 必须被转换成普通 user 消息。

在原版目录应用补丁后，使用已安装的 Bun 1.4.0 及仓库原 lockfile：

```powershell
git apply <本补丁的绝对路径>
& $bunExe install --frozen-lockfile --ignore-scripts
& $bunExe test tests/desktop-continuation.test.ts tests/environment.test.ts tests/subagent-environment-history.test.ts tests/compaction-v1.test.ts tests/server-compaction.test.ts
& $bunExe test tests/chatgpt-web-harness.test.ts --test-name-pattern 'compaction|canonical environment|user revision|instruction lineage'
& $bunExe x --no-install --bun tsc --noEmit
```

2026-09-20 已执行：第一组 117/117，第二组 6/6（77 项未选），类型检查 exit 0。新增文件含 38 项回归；最初原版的 29 项新用例有 23 项失败。CLI 使用上游 `Bun.build` 的 target=bun、minify、packages=external、external=playwright-core 参数成功生成。完整日志和候选 CLI 位于项目 ignored `tmp/bridge-continuation-20260920/`，源码快照位于 `tmp/bridge-source-audit-20260920/`。这些是局部代码/构建证据，没有新增模型请求或真实 Pro 工具回合。

安装边界：

- 不直接覆盖安装目录的 `app/cli.js`，也不伪造 manifest。`launcher/electron/runtime-install.cjs` 会校验完整文件清单及 bundleId；启动器下次启动会用其随包 runtime 恢复不匹配目录。仅重算安装目录 manifest 仍与启动器资源内 bundleId 不符。
- 后续应通过原项目构建/打包流程生成与 launcher 资源一致的完整产物，或升级到含等价修复的上游正式包。沿用原完整性校验、登录资料、配置与权限，不新增绕过校验的启动器。
- 切换前确认其他会话已结束；原 `/admin/drain` 必须原子确认 active_http_turns / active_browser_turns 均为 0。繁忙或状态不明确时退出并恢复接收，不取消他人任务。保留原完整包及安装身份，回退整包，不只还原一个文件。
- 启用后做一个有新原生指令的 Pro 文件读取/工具续轮，再观察实际运行版本。进程重启会丢失内存 checkpoint，不能承诺原失败任务在没有新指令时自动恢复。
- CLI 沙箱网络/共享盘访问属于该任务实际权限，桥接识别修复不赋予主任务权限。另一会话正在修正该层，本补丁不改全局权限或账户。

等上游提供完整等价修复并验证后，移除本地候选补丁，保留 Git 历史；不长期维护第二套桥接器。
