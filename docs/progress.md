# OpenScience 进度（CURRENT window）

> 最新同步：2026-09-05 +08。历史由 Git 保存；旧 release 和旧计划不是默认下一步。

## Current version tuple

- Worktree / branch: E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance / codex/product-workflow-design；application parent HEAD c07c8d1（PR #84），后续 docs-only HEAD 以 Git 实时值为准。
- Production release / rollback: c07c8d15e5ba3b722577f42d6ad72af8c83189fe / 440266c53325044f2bdff21b1ebfe1be6b792f71；core/search migrations 36/36、2/2。
- Active/public 标记一致；13 个容器运行，目标服务健康，无 failed marker/journal；部署、retention、公网和 loopback 验收完成。
- 根目录旧 main b9616cb 与既有 memory/配置/用户资料保持原样；不是开发或部署源。

## 2026-09-05 — UI revision deployed, next product slice advanced

- 当前本地 HEAD 478d512 + 图解候选，生产仍 c07c8d1。候选已完成 Claim 事务失效、私有预览/scoped task、主张创建和完整操作页、源 PDF 进入提交且保留旧附件、renderer v2 与 excerpt 修正；独立复审无剩余产品阻断，待合入部署。
- 全仓 build/typecheck/lint/test 通过（既有 search storage 8 个集成用例未配置 DB，按原配置跳过）；Web 491+Node5、domain568、worker502、API130。生产构建浏览器首次98/99，唯一失败为模拟任务过快完成后的进度条断言，修正时序后图解9/9；源文件续接9/9通过。未重复运行其余已通过的90个用例，后续CI执行完整99。
- 用户已授权自行选取/下载 PDF、上传验证和选择必要开源方案。本轮复用现有能力与已安装 pdfplumber，无新安装；D2NN arXiv:1804.08711v2 / 20 页 / 4,000,593 bytes 已通过真实页面上传、Hermes 确认、Editor commit。自动三字段，另三字段人工核对并明确标记；91.75% 数值准确率与 88% 选定实验样本一致率严格区分。图解后半段待候选部署，证据在 ignored chart-workflow/。

- 用户否决首批页面视觉，要求成熟方案优先。采用居中自适应应用容器、紧凑标题、资料/项目分区、可展开长列表、统一表单按钮和手机布局；UI 最终候选 440266c 已上线并交用户查看，用户尚未验收效果。
- PR #81–83 同时修复不存在的 /ingest 任务链接、准确的任务查看文案和 Hermes unsafe patrol 连续动作重复；撤回导致 detached 菜单重叠的最后六行 Dashboard 压缩。复用现有 UI 栈，无新增依赖或迁移。
- 后续 PR #84 已部署 c07c8d1：生成/审核使用内容编辑角色与 draft Version；Worker 提交前重验权限、任务、版本及 Claim 内容，复用 Serializable draft fence；只读成员/archived 读取不变。
- 全仓 build/typecheck/lint/test、domain 12/worker 16/API 3、独立安全复审与 CI 33942733721 GREEN（Product88 + Hermes）。ECS build、精确 Parser 16-case、ScanSci OA/Worker、BGE 真实向量、migration、健康与 retention 通过。
- 最终生产公网页面 fixtures 16/16（41s），不写用户数据，不代替真实 OAuth/SMTP/账号数据纵向验收。日志位于 apps/web/test/visual/out/research-continuation/presentation-security-*；效果截图位于 apps/web/test/visual/out/profile-*.png。

## Deployment diagnosis retained

- 早先 000120b 的 OA 下载等待中止后 canonical rollback 恢复 6478aa8；最终 UI440 完整下载验收成功。外部下载速度有波动，本轮有效 OA 为 24,671,920 bytes、SHA d57dc94c…f484a，canary cleanupCount 0。
- c07 首次发布在 mutation 前因 runtime entryCount 96518→96515 拦截，镜像未变、生产440正常。三个原始路径未定位，不能声称根因修复。
- 旧报告原子保留；正式重新验收通过，前后清单无增减；完整 install/database generate/build/normalize/四镜像构建后官方报告仍有效。唯一重试通过并部署 c07，未改校验值或跳过验收。

## Product state and next action

- Research Intelligence Tasks 1–12 完成；既有真实样例 OSR-2026-000019（展示）和 OSR-2026-000021（论文解析到发布）。不恢复旧 Task 10–12 工作。
- 同事 frontend/nanqing@e5db5ae 的 18 个 Web 文件已在 PR #78 选择性整合，每日 10:00 巡检已设；避免重复移植。
- 下一步合入部署图解候选，用受控真实论文完成源文件续接→Claim 表单→生成/预览/批准，并对同一PDF重跑提取。现有 chart 为主张摘要卡片，不冒称科学机制示意图/生成式图片已完成。
- 私有预览和完整图解 UI 已本地验证，仍待生产真实后半段；图片、视频、Hermes 语音和深入讨论继续按段推进。
- 剩余边界：生产 c07 尚无候选的 Claim 失效处理；Worker 拒绝落库可能留下无引用对象；媒体沿用 charged-on-submit；并发测试为确定性交错。真实提取最初三字段空缺已人工标记补齐，excerpt 改善须上线复验。
- 新 session 从 CURRENT handoff、需求基线与本文件读取；生产基线 c07c8d1，必须重新实测。ScienceDirect 后续仅走官方授权，不引入绕过方案。
