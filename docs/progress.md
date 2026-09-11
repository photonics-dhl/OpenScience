# OpenScience 当前进度

## 2026-09-11 — 产品体验改造已部署，视觉收尾中
- 应用c0fdc389 / rollback4909e11b；provider d1630135不变。服务器必要构建启动exit0，未运行测试/CI/本机build。
- Chat6Pro规划、项目apple-design/emil-design-eng/frontend-design及Sol High复核已用于实际实现。
- 研究桌面/共享会话/单一资料入口/公开大图/真实缩略图已部署；公开22/v10与图实际打开。
- 三条19/20/21 Task/E2E可恢复归档已完成，公开index只剩22，原文件/版本保留。
- 实际跨桌面/编辑器/探索/公开页保持账号；/me200及7天Cookie续期已观察。补修重复global头像、初次任务loading/失败fallback和单条探索横卡，待部署；最终状态见唯一CURRENT handoff。

## 2026-09-11 — 第一篇真实带图 RO 已公开
- 历史发布节点：branch codex/onchip-video-release；worktree .worktrees/onchip-video-release。应用/code378a950697e3addd390c05a3dc29af0362328807已部署exit0，rollback9c5088ea；provider d1630135/rollback92cc416e，无新软件。后续docs-only提交不代表新release。
- 公开成果：https://openscience.428312321.xyz/research/OSR-2026-000022/v/10 。v10=f4e2dc71，RO c896802c；已纠正旧v7误记。Hermes对话发布201，时间2026-09-11T14:39:38.371Z；匿名HTTP200，核心图片实际加载。
- b19a65bd原Chat刷新后取回PNG1672×941/622483bytes，原任务retry入库，无重复生成。主会话/Sol High/Chat6Pro真实图片科学审核通过，Hermes“采用1”批准。e0旧错误图仍rejected。
- 原PDF/高级解析与服务器Hermes凝练复用，无重跑OCR。48条context来源经人工逐组确认，2条只有章节标题的关联移除，102条Evidence/原PDF/历史保留。两重复Claim归为对应核心的supporting，12claims/6core、所有ID/text/证据及b19来源不变。
- 已交付发布恢复：已有Claim图校验纳入review，保留publish终检；未公开版本Hermes“继续编辑”撤回审核到draft实际200，权限/Serializable/Publication存在保护/审计和审核失效完整。
- 贡献→图视频→六字段→折叠资料已实际观察；图片居主要位置，视频保留占位。项目apple-design/emil-design-eng/design-artifact/html-prototype已安装登记；冷白/墨色/青绿与共享网格沿用。
- 普通Chat6Pro实际回复支持当前图作为概念示意公开，并讨论受限撤回审核方案；Sol High做发布并发/权限及实际数据变更静态复核。未下调科学要求，未宣称量化token节省比例。
- 没有运行测试/CI/本机build；仅服务器部署必要编译启动及用户授权真实产品操作。部署日志C:/Users/Mac/AppData/Local/Temp/xgs-deploy-publish-recovery-20260911.log。

## 本轮真实问题与修复
- Chat空白并不等于没生成：刷新原会话找回图；只关闭不响应空主页恢复CDP，不重启全浏览器或重发请求。provider已移除自动整浏览器重启及单任务uncertain全局阻断。
- 页面3分钟停止等待、retry空JSON问题已由9c修复；这轮不再重跑这些检查。
- 发布review遗漏主张图校验，导致approved后无法编辑：378将同一规则前移并添加显式撤回审核，避免困住用户。
- DOM截图受Chrome125%缩放裁切，实际clientWidth=scrollWidth=1140；不据裁切误报网站横向溢出，也不宣称完整视觉验收。
- 原稿科学错误/旧素材拒绝保留，不用历史演示代替当前图。

## 尚未完成与入口
- 当前一篇带图发布已闭环；视频、真实多图HTML样本/独立导出、其余精选论文和更大范围旧数据归档尚未全部完成。暂停视频与批量冷启动。
- 本次包含人工浏览器恢复、证据确认和重复节点整理；通用全自动异常恢复未证明，不把展示样例冒充所有新论文已自动可靠处理。
- 唯一CURRENT：docs/handoff/2026-09-10-hermes-web-image-handoff.md；详细产品证据、风险、版本、控制入口按该文档。
