# OpenScience 进度（CURRENT window）

> 最新同步：2026-09-06 +08。生产f144eb7，rollback b23102b；Codex controller3d518af、demo7e1b6ea独立。后续文档提交不改变生产。

## Global Hermes presentation actions — deployed and accepted

- PR98接通全局Hermes分镜创建/修订/配图确认，复用已有RO版本/Claim/权限/任务/草稿页面。成功和版本切换清除准备状态；不明确的提交在当前抽屉内保留同一请求。无新接口、迁移、依赖或模型安装。
- PR99修正未定义ink-paper颜色令牌：真实截图暴露浅色文字/透明按钮，回归先红后绿；使用现有ink配色。最终服务器中文确认卡、按钮实际颜色和中英文1440/390布局通过。
- 真实任务0f50d797-4340-4ce8-9307-1268ea5610a5在b23102b创建：6幕/3条来源/原分镜保留/独立draft，1次执行/0重试/1Credit/1生成审计。M3 13.374秒，1540输入/924输出token；实际美元成本字段为空。f144eb7只读复验新增任务0，账号退出通过。
- 本地全仓build/typecheck/lint/test通过；web514、展示浏览器15、Hermes回归14；配色补修browser3及独立审查通过。PR98及其main CI通过；PR99 CI34015765809通过，重复main CI34016486547在记录时仍运行。
- 最终服务器精确build/parser16/运行依赖/迁移状态/BGE/ScanSci/容器健康/公网200/出网204/retention通过；无待迁移、无残留部署事务。完整证据见CURRENT handoff及忽略目录global-hermes-*。

## Existing foundations and limits

- 已有PDF上传保留原件、RO Claims、概念图、分镜与审稿流程；method/results/reproducibility自动提取仍有缺口。当前分镜输入是所选Claims及条件/限制，不是完整Evidence/SourceMap自动理解。
- Codex管理员验证生图仍可通过现有Gateway/Worker使用，受PC/v2ray与账号额度约束；不是面向普通用户的通用Codex执行服务。已有图像4661e80a仍为draft，未重复调用图像模型。
- 独立D2NN demo保留机制插图与连续Serena v4音轨；未新增图片、视频或TTS调用。CPU生图模型安装仍由用户暂停，继续复用Chromium/FFmpeg/PyTorch/Qwen/Codex。
- 跨浏览器/跨RO的不明确请求恢复未实现；来源失效或撤权仍由服务端重验。生成资产须人工审核，不是论文原始证据。

## Next

- 将已有CPU渲染器接到任意已审核RO分镜与场景素材，继续贯通视频生成/任务/草稿审核；之后完善全文提取和Evidence溯源。
- 唯一CURRENT交接：docs/handoff/2026-08-16-hermes-2d-pet-handoff.md。根目录main仍为b9616cb且用户文件未动，不得与origin/main或生产混淆。保留既有前端分支定期巡检，不重复建自动化。

## Generic renderer development — 2026-09-06

- Added bounded file-driven3–6scene renderer using existing Canvas/Chromium/FFmpeg and continuous audio mux. Source manifest is rendering data, not RO approval. API/tasks/TTS integration remains next.
- Startup verified production/public f144eb7 and rollback b23102b;50G used/92G available, containers/public200/egress204 healthy. Prior main CI34016486547 completed successfully.
- Local candidate is not deployed; independent review and isolated server rendering acceptance in progress. See current plan/runbook for boundaries.
