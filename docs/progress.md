# CURRENT Progress Window

动态状态以 Hermes CURRENT（docs/handoff/2026-09-10-hermes-web-image-handoff.md）为准；本页只保留最近检查点。

## 最近检查点
- 2026-10-07：启动全站 UI 质量重整。已调研 GitHub Primer、Apple HIG Motion、OpenAI UI/Product Design 官方资料，并将“公开阅读／研究桌面／工作区／账户管理／身份页”页面系统与验收标准固化到 `docs/plans/2026-10-07-product-ui-quality-plan.md`；补充 `design-system/openscience` 的 OpenScience 覆盖规则与研究桌面、公开阅读、指南页面规则。第一批共享壳层改动在 `ShellPrimitives.tsx`、`ProductRouteNavigation.tsx`、`product-polish.css`：产品页头保持文档流、当前路由有稳定底部指示、移动端导航保持可用。浏览器真实观察：本地 `/guide`、`/explore` 均可加载，无横向溢出，指南 Hermes 360px、当前路由正确；TypeScript 与 tokens contrast 10/10 通过。整站其余页面仍待继续打磨，尚未部署。
- 2026-10-07：指南艺术方向样板第一版已改为编辑式首屏：真实研究证据承担主视觉，去除后台卡片式外框，Hermes 与研究区域共享视觉轴；本地浏览器实际点击验证场景 tab 切换，impeccable detector 无发现，Web typecheck 与 tokens contrast 10/10 通过。由于本机 API 未启动，真实研究图在本地进入可见空状态；该状态已单独观察，最终审美仍需用 API 正常的真实素材验收。尚未部署，下一步先做 390px 真实视口复查，再迁移构图语法到探索、期刊与研究桌面。
- 2026-10-07：指南 390px 规则继续细化：标题/引导保持全宽，紧凑 Hermes 与“下一步”并列进入首屏，避免陪伴入口被推到页面后部。TypeScript、tokens contrast 10/10、impeccable detector 通过；本地预览端口随后不可连接，尚未把该轮视为真实视口验收，也未部署。交付树中 `packages/domain/test/assets/storyboard.test.ts` 的并行未提交改动未归本轮处理。
- 2026-10-07：公开探索页继续收敛为研究目录：搜索工具去除大圆角卡片与阴影，改为安静的上下规则线和扁平动作按钮，研究条目的编辑式节奏保持不变。Web typecheck、tokens contrast 10/10 与 impeccable detector 通过；尚未做真实浏览器截图或部署。
- 2026-10-07：已读取 Synclip 官方博客页当前列出的25篇文章，整理为 Synclip 总指南，并新增 `.agents/skills/openscience-research-video/SKILL.md`：Hermes 现在有基于论文原文/Claims/已确认分镜的短镜头规划、连续性审查和额度保护方法。两项 Skill 已加入并安装到原生 Hermes catalogue；生产仍只确认 `gpt-image-2` 图片 adapter，Synclip 视频 exact API/model contract 尚未确认。
- 2026-10-07：应用 release `0c8fbf58824a59abc585643241a3083315b496df` 已按既有发布事务成功上线，回滚为 `33f4ffedfed4b2acac0646c2f9a42c28ceeb24cd`；CI `37643577812` 全绿。服务器原生 catalogue/runtime 已安装并读回 `project-catalogue-0c8fbf58824a59abc585643241a3083315b496df` / `installed-native-continuation-0c8fbf58824a59abc585643241a3083315b496df`，API/Worker healthy、Hermes timer active/enabled，Worker 绑定检查通过。此次部署使用 `--no-tests`，Parser/ScanSci/embedding 深层 canary 仍未观察。
- 2026-10-06：用户固定 GitHub 协作目标为 DHL 仓库 `frontend/nanqing`，不合并 `main`；Nanqing96 三条旧分支与旧前端 tip 已原样归档至 DHL `archive/*`，保留提交/文件。共享期刊 PDF 候选补实时页图和每次 OCR 外发授权修复 `81ae7d2c`，本地 Domain14、Gateway38、Worker6 与类型检查通过，独立 High 代码 GO；最终分支 CI、Linux socket、parser acceptance、服务器部署及真实 Hermes 科学验收尚未完成，详见[期刊 CURRENT](handoff/2026-09-15-journal-onboarding-handoff.md)。
- 2026-10-06：按用户要求建立期刊 PDF 与首页论文入口共用解析/核源候选：保留私有页码 SourceMap，新 PDF 调用首页 P 工具、六字段与 Claims 终审，期刊授权/编辑确认/发布仍独立；旧 J 检查点不变。基于共享分支 `0a773d93`，本地检查与期刊/共享 Hermes 两组 CI 成功；尚未做真实 Hermes PDF 或部署验收，运行收据与限制见[期刊 CURRENT](handoff/2026-09-15-journal-onboarding-handoff.md)。
- 2026-10-06：修复随 `d6ddcd57` 发布后，用同一 RO 第二幕新任务 `e8b6cb5d-f251-426a-8017-8d5b79354976` 完成真实验证：Synclip `gpt-image-2` 产出私有 draft，MiniMax-M3 原生审校 `completed/accepted`，任务 100%/无错误；页面显示两张图片，未公开。公网 `/__release` 与 `.release-id` 均为 `d6ddcd57fb8848328183460ae91783248915b604`，Worker 近10分钟无该解析错误。
- 2026-10-06：最终 Hermes UI 修正随 `456e550f69652b00569d2435c5f8283df3534d9f` 部署，回滚为 `4c5cd1c7974301a0552b691b83f4f8fd1a103abf`。390px 线上验收确认指南与登录页使用页面自有 196×156 紧凑陪伴位，探索页使用公共 shell 兜底位，Landing 无 Hermes；指南滚动到底部重叠 0、无横向溢出，点击展开 300px，桌面指南保持 360px。发布使用 `--no-tests`，Parser/ScanSci/embedding 深层功能探针未验证。
- 2026-10-06：第二篇独立论文真实复测发现 Worker 在图片已由 Synclip `gpt-image-2` 成功保存后，因重复使用窄 `JSON.parse` 误拒绝 MiniMax-M3 返回的 `<think>`/代码围栏审校结果；任务 `73746a85-3c51-4d2e-8cec-fbdf2d70e2b6` 保留私有 draft PNG `6ac218…`，原生审校 checkpoint 保持 `started`，未盲目重发。修复提交 `4c5cd1c7`：Worker 复用 Gateway `parseStructuredJson`，定向回归 14/14、Worker typecheck 通过；CI `37347672220` 已全绿，尚未部署或再次真实验证。
- 2026-10-06：线上 `4ed53b71faa11692756bcf79d5b3504e57581b19` 部署完成并通过 release/CAS、Nginx、容器启动健康和公网 `/__release` 复核，回退为 `7d208827d0e0bc41811b46dc1bf67231daf8230a`。Hermes 窄屏入口已改为右下角透明浮动邀请，不再生成全宽底栏；内容末尾保留透明安全区，390px 指南页滚动到底部与 CTA 重叠数为 0、无横向溢出，点击后展开 300px companion surface；桌面仍为 360px。Landing 保持不变。Parser/ScanSci/embedding 深层能力探针因本次 `--no-tests` 未验证。
- 2026-10-06：在现有已确认分镜上完成一次新的真实站内生图复测。RO 9067a2d5-42ad-4c06-b234-753728b71064 的 `presentation.generate` task `ead639dc-e480-4520-8f0c-691402c8b739` 单次执行 succeeded/100%，retry0、attempt1、error=null；Synclip `gpt-image-2` 资产已保存为私有 draft，Hermes/MiniMax-M3 图像审校 accepted，页面实际可见且人工核对公式、分区和曲线可读。
- 2026-10-05：线上 fcc8ad62357134cfe16238f6a04bf0e5b2598a64 完成第二篇真实入口部署；后续 UI 候选已合并至本次 7d208827 发布。
- RO 9067a2d5-42ad-4c06-b234-753728b71064 的 Hermes run 7a959a7f-dbcb-4dfa-afc1-28a12867cdbf 完成全文来源、独立 source-review 和4幕科学分镜；source task 8aa82e71-92e6-4bf5-86c6-bd5ecec07efb 为 review_received，分镜 task 7244a6c3-b166-4d09-8494-4e75f4eb4e23 为 succeeded/illustrationReview=accepted。
- Synclip gpt-image-2 四幕结果为3次供应商成功、其中2次图像审阅接受、1次图像审阅阻断；第四次 task 28ab61b0-7931-41d3-8200-2d63c1f986ad 为 UNCERTAIN，没有可安全重试的 task_id/receipt，run 为 failed。
- 真实结果说明传输链路当前可运行，但还不能称长期跨论文稳定：旧第四幕未知外部终态仍未分类；本次新图已完成一次实际像素核对，其他旧图的科学/像素结论仍按原记录处理。
- 只读服务器核查显示 timer/broker 正常，当前 Synclip GET 诊断请求返回404且约0.28秒；本次证据排除了“服务整体不可达”，但客户端仍缺少第四次 POST 的原始错误分类。
- 分镜完成后真实 run 自动开始了图像任务；本次复测没有自动公开，资产仍为私有 draft。另有生产日志出现 `/auth/me` 的重复 reply/HTTP 500，需要单独修复并验证，当前未证明它阻断了本次生图。
- `f52ee24c` 的 session guard 修复已随 `4ed53b71` 上线；线上未登录 `/auth/me` 返回统一401，发布后15分钟未再出现重复响应错误。定向 API 16/16、文件级 ESLint通过；API全包typecheck仍复现 journals/papers 的6个 HEAD既有错误。

## 后续
- 不重放未知 task；先确认 Synclip 的幂等/客户端关联合同，再决定最小 transport 诊断或恢复改动。
- 依照用户目标继续以Hermes作为论文理解与科学分镜主体；当前图像审阅由既有 imageReview/M3 步骤执行，Hermes独立像素核验尚未作为真实验收事实。图像API只处理已绑定的科学prompt；本次 Worker 解析断点已修复并完成一次生产复测，但长期跨论文稳定性仍需更多不同论文/分镜样本，不重放旧未知任务或当前 `started` 审校任务。
- 旧失败运行、Skills审阅和安装记录保留在Git历史与ignored tmp，不作为当前入口。
