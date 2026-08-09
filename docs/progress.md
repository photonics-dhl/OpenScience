# OpenScience (XGS) 进度日志

## 2026-08-09（产品闭环 Task 3）— Dashboard 已接入真实会话与研究数据

- **✅ API 合同**：新增 `GET /research-objects?workspaceId=<uuid>`；当前用户必须是工作区成员，归档 RO 排除，按 `updatedAt desc` 排序，仅返回摘要字段，不包含 SDF 正文；domain tests 13/13 通过。
- **✅ Web 数据流**：Dashboard 依次恢复 `/auth/me`、个人/首个 active workspace、成员范围 RO 列表与未读通知；401 安全跳转登录，loading/error/retry/empty/ready 状态均可见，真实 RO 使用 UUID 进入统一 Workspace，不再把 Figma 样例当成用户数据。
- **✅ 验证**：Web 全量 82/82、Web/API typecheck、全仓 build 通过；API 集成测试已加入成员/越权/归档/无 SDF 断言，但本机 Docker Desktop 未运行，待开发数据库栈可用后执行。
- **⏳ 下一步**：Task 4 实现首个 RO 引导创建（空白六字段/材料提取、Hermes 披露确认、幂等创建）并接入 `/research-objects/new` → Workspace。

## 2026-08-09（产品闭环 Task 4 开始）— 首个 RO 创建入口已落地

- **✅ 创建入口**：新增 `/research-objects/new` 与 `CreateResearchObjectFlow`；空白六字段和材料提取两种模式共享同一 RO → Workspace 路径。
- **✅ 安全产品约束**：材料模式必须勾选 Hermes 数据处理披露；前端验证覆盖标题、材料、披露三类错误；写请求携带 CSRF 与每次尝试的 `Idempotency-Key`。
- **✅ 数据层前置**：ResearchObject 新增可空唯一 `idempotency_key`，迁移 `20260809010000_ro_create_idempotency` 含 rollback；空白创建不会要求材料披露。
- **✅ 验证**：create-flow validation 3/3、全仓 build 通过；数据库迁移执行与真实创建 E2E 待 Docker/数据库栈恢复后继续。
- **⏳ 下一步**：补齐创建 UI interaction tests、服务端幂等重复请求测试，并在本地栈可用后完成 Register/Verify/Login → Create → Workspace E2E。

## 2026-08-09（产品闭环 Task 4 生产部署）— 首个 RO 入口已上线

- **✅ 生产迁移**：生产数据库已应用 `20260809010000_ro_create_idempotency`；生产栈四容器均为 running，并使用 `--force-recreate` 载入新 Web/API 构建。
- **✅ 公网巡检**：`/auth/me` 匿名 401、`/dashboard` 200、`/research-objects/new` 200；安全头包含 CSP `default-src 'none'` 与 `X-Content-Type-Options: nosniff`。
- **✅ 会话闭环补强**：Dashboard 增加退出登录动作，登出后回到 `/login?next=/dashboard`；创建页对失效会话保留可恢复错误。
- **✅ 工具修复**：`scripts/cloud-sync.mjs` 兼容 Windows Node → Windows OpenSSH 的 key 路径，避免部署同步误报成功但未认证。
- **✅ 并发安全**：幂等创建在唯一键竞争时回读胜者，重复提交不会因 P2002 泄漏为 500。
- **⏳ 下一步**：补真实邀请邮箱 E2E（不提交任何邀请码/密码/验证码），随后继续 Hermes 证据确认、不可变版本、发布 preflight、Public RO、Editorial Curator 与 Live2D bridge。

## 2026-08-09（产品闭环 Task 2）— 邀请身份流程已实现

- **✅ 身份闭环**：新增 `/login`、`/register`、`/verify-email`，真实连接注册、验证、重发、登录、登出和 `/auth/me`；会话仍由 HTTP-only Cookie 管理。
- **✅ 安全与恢复**：`safeNextPath` 阻断外部/协议相对跳转；服务器错误码映射为中英双语可恢复提示，不暴露后端诊断；表单包含提交锁、`aria-live` 与浏览器 autocomplete。
- **✅ 产品视觉**：身份页沿用深墨 Living Research Observatory，桌面为研究命题与身份表单双栏，移动端重排为价值 → 身份表单；Landing 创建入口改为受邀注册。
- **✅ TDD / 构建**：身份测试先 5/5 RED 后 5/5 GREEN；全量 Web 80/80、typecheck、Next build 通过。三个身份路由浏览器状态均 200、无 `MISSING_MESSAGE`、无 console error；键盘焦点可达字段。
- **✅ 提交**：`6540d2d feat(web): add invited identity flow`。
- **⏳ 下一步**：Task 3 增加成员范围内的 RO 列表合同，并把 Dashboard 的 Figma 样例替换为真实会话、Workspace、RO 和 actionable notifications 数据。

## 2026-08-09（产品闭环 Task 1）— 同源 API 与 CSRF transport 已实现

- **✅ RED → GREEN**：新增 `apps/web/test/api-client-contract.test.ts`；先验证 5 项预期失败，再实现后 6/6 通过。
- **✅ Web transport**：`apps/web/lib/api.ts` 导出统一 `apiRequest`，自动维护内存 CSRF token、保护写请求、对 CSRF 403 只刷新重试一次；沙箱写入也收口到该 transport。
- **✅ 路由修复**：`infra/nginx/openscience.conf` 的 `/api/` 使用尾斜杠 strip-prefix；`apps/web/next.config.mjs` 增加本地 `/api/:path*` rewrite。
- **✅ 验证**：Web focused test 6/6、Web typecheck 通过，`git diff --check` 通过；提交 `1ab4b6d`。
- **⏳ 下一步**：进入 Task 2，先写身份页面失败测试，再实现邀请注册、邮箱验证、登录、登出和安全 next 跳转。

## 2026-08-09（产品闭环规划）— 身份与首个 RO 生产纵切片

- **✅ 基线恢复**：复核已批准产品 spec 与六阶段网页计划；确认后端身份、Workspace、RO 能力已存在，前端仍缺登录/注册/验证和真实数据编排。
- **✅ 根因审计**：网页请求统一使用 `/api/*`，生产 Nginx 当前未剥离 `/api` 前缀，导致真实 API-backed 页面请求落到 Fastify 不存在的 `/api/...` 路由；该修复被列为纵切片 Task 1。
- **✅ 实施计划**：新增 `docs/plans/2026-08-09-product-auth-create-flow-plan.md`，按同源 API/CSRF → 身份页面 → 真实 Dashboard → 创建 RO → 本地与生产 E2E 五个独立门推进。
- **✅ 基线门禁**：隔离 worktree `codex/product-web-task1` 的 Web 测试 69/69、Web typecheck 通过，工作树在规划前干净。
- **⏳ 下一步**：按 TDD 执行 Task 1，同步修复生产 Nginx 前缀剥离、开发 rewrite 与 CSRF API client；通过检查点后继续身份 UI。

## 2026-08-09（生产上线）— 前端路由闭环已部署到 ECS

- **✅ Release**：以 `3b5a34e` 执行 `infra/scripts/deploy.sh --confirm --skip-migrate`；代码同步、远端 19-workspace install、全量 build、生产栈 `--force-recreate`、Nginx `nginx -t && reload` 均通过。
- **✅ 线上容器**：API / Postgres / Redis healthy；Web 新容器已重建并运行新 Next build；磁盘 9% 使用率、内存可用约 28GiB，Nginx active。
- **✅ 公网验收**：Playwright reduced-motion 访问 `https://OpenScience.428312321.xyz/`、`/dashboard`、`/research-objects/OS-RO-01J8YF7Q/workspace`、`/research-objects/OS-RO-01J8YF7Q/collab` 均 HTTP 200；无 `MISSING_MESSAGE`，线上 Dashboard/Workspace 新路由已实际可见。
- **安全边界**：本轮跳过数据库迁移（无 schema 变更）；未读取/打印 `.env`、未上传密钥；`/auth/me` 与 `/admin` 保持未登录 `401`。
- **⏳ 下一步**：启动真实用户验收与 API-backed E2E；公开发布前仍需真实数据、登录、创建 RO、保存版本、权限和 Public RO 发布链路验证。

## 2026-08-09（生产部署诊断）— Web 容器未重建导致公网仍为旧前端

- **部署尝试 2**：API healthcheck 修复后生产栈启动成功，API 变为 healthy；公网 `/` 200，但新 `/dashboard` 与 `/workspace` 仍 404。
- **根因**：Web 容器使用源码 volume，`docker compose up -d` 未检测到配置变化而复用旧容器/Next 进程；远端新 build 的 `.next` 未被当前进程重新加载。
- **✅ 修复**：`deploy.sh` 生产栈命令改为显式 `--env-file ... up -d --force-recreate`，保证 Web/API 都从本次构建产物启动；待提交后重试公网验收。

## 2026-08-09（生产部署诊断）— compose env-file 缺失

- **部署尝试**：同步代码与远端全量 build 成功；生产栈启动在 compose 插值阶段停止，错误为 `POSTGRES_PASSWORD required`。没有重启容器、没有执行迁移、没有改变数据库。
- **根因**：`infra/scripts/deploy.sh` 调用生产 compose 时遗漏 `--env-file /opt/openscience/.env.prod`，而服务器生产栈依赖该文件做变量插值。
- **✅ 修复**：部署脚本现在显式传 `--env-file $PROD_ENV`；runbook 已同步。下一步重新执行 dry-run 与 confirm 部署，然后验证容器健康和公网入口。

## 2026-08-09（生产部署前置修复）— API healthcheck runtime mismatch

- **根因**：生产 `openscience-prod-api-1` 日志显示请求正常，宿主机 `curl http://127.0.0.1:3001/auth/me` 返回 `401`；容器 unhealthy 的唯一健康探针失败原因是 `node:22` 镜像没有 `wget`，而 compose healthcheck 使用了 `wget -qO-`。
- **✅ 修复**：`infra/compose/docker-compose.prod.yml` 改为 API 容器内置 Node `fetch`，只有 `/auth/me` 返回 401 才判定 healthy；不改变 API 业务路由或认证策略。
- **⏳ 下一步**：提交该生产修复后，使用部署 runbook 同步当前 release、全量 build、重启生产栈并验证 API healthy、Web、Nginx 和公网 HTTP 状态。

## 2026-08-09（产品网页可访问闭环）— Workspace overview 与协作 i18n 修复

- **根因审计**：逐路 Playwright 发现 `/research-objects/[id]/workspace` 缺少 route，点击概览必然 404；协作消息把 next-intl 分段路径存成含点号的扁平 key，导致 `MISSING_MESSAGE` 与原始 key 暴露。公开页在无 API 时已使用 not-found/unavailable 状态，不是路由 404。
- **✅ 路由闭环**：新增 `/research-objects/[id]/workspace` 与 `WorkspaceOverview`，即使 API 未运行也显示明确的只读/等待连接状态，并保留 SDF 编辑、协作、公开页入口；Dashboard 主 CTA 改为先进入 overview。
- **✅ 上下文连续**：协作页现在也由 `RoWorkspaceShell` 包裹，`mode=collaboration`、RO ID、版本、workspace 与权限状态不会在 Editor → Collaboration 切换时丢失。
- **✅ i18n**：collab issue/pr/review/notification 动态路径改为嵌套 JSON，补 `collab.common`；新增合同测试覆盖 next-intl 分段解析，浏览器不再出现 `MISSING_MESSAGE` 或原始翻译 key。
- **✅ 验证**：Web 14 files / 69 tests、typecheck、production build、docs lint（0 issues）、docs-sync 均通过；Playwright reduced-motion 七路 smoke 覆盖 Landing、Dashboard、Workspace、Editor、Collaboration、Public RO、fixed version，全部 HTTP 200、0 `MISSING_MESSAGE`、0 原始 i18n key，输出 `FRONTEND_ROUTE_SMOKE_OK`。
- **⏳ 下一步**：真实 API 服务恢复后做带数据库的登录→创建→编辑→发布 E2E，不把无后端数据伪装成已发布研究。

## 2026-08-09（产品网页 Task 2 / Workspace shell）— RO 上下文与移动端 parity

- **✅ 已完成**：新增 `WorkspaceContext`、`WorkspaceModeNav`、`HermesRail`、`RoWorkspaceShell`；现有 `/research-objects/[id]/edit` 现在由统一 shell 包裹，稳定传递 `roId`、`versionId`、`workspaceId`、`mode=sdf`、`permission=edit`。
- **✅ 六模式**：桌面和移动端同时提供概览、SDF 编辑、材料、版本、协作、公开页六个入口；移动端使用固定底栏，不删除功能。Hermes 轨显示当前上下文并明确写入前确认边界。
- **✅ 回归与视觉**：Workspace shell 专测 2/2；全量 Web 13 files / 66 tests；typecheck、production build 通过；Playwright 390×844 / 1440×900 截图检查通过。编辑器 API 404 错误状态仍可见且错误取消文案已补齐 i18n。
- **⏳ 下一步**：把 `workspaceId` 从加载占位接到真实权限/协作上下文，增加 overview route 的真实摘要和 Public RO/Collection 链接；随后补 loading/empty/permission 交互测试。

## 2026-08-09（产品网页 Task 2 / 首个网页实现切片）— Dashboard + Landing evidence field

- **✅ 已完成**：把用户确认的 Figma 六屏语义映射到现有 Next.js；新增 `/dashboard` action-first 驾驶舱，展示唯一下一步行动、稳定 RO ID `OS-RO-01J8YF7Q`、v0.4 草稿、Hermes 状态与任务轨；现有编辑页增加 `workspace-cockpit` chrome，贯穿 RO ID/版本。
- **✅ 动效边界**：Landing Hero 新增 `EvidenceField`，18 个确定性蓝色粒子和两条低对比证据轨迹，仅为 `aria-hidden` 环境层；`prefers-reduced-motion` 停止漂移，产品语义仍由原生文本、RO 版本和证据字段承载。未调用 MiniMax、未读取 `.env`、未新增图片/视频。
- **✅ 验证**：`@openscience/web` Vitest 12 files / 64 tests passed；typecheck passed；Next production build passed；Playwright 1440×900 截图已人工检查 `/dashboard` 与 Landing。
- **⏳ 下一步**：接入 Dashboard 真实 API 状态与 Public RO/Collection 入口，补 workspace 交互截图和移动端回归；Figma Landing → Auth/Create direct-child 补链仍作为独立维护项。

## 2026-08-09（产品网页 Task 1 / Step 9 第二检查点）— Dashboard + RO Workspace 已获用户确认

- **Figma 交付**：只在长期账号 canonical 文件 `gjhowMG7cG4clKwvhvF08E` 的 `04 Screens` 新增顶层 Section `2057:99`、Dashboard `2031:10`、RO Workspace `2031:11` 与状态/交互契约条 `2031:12`；施工期 wrapper/row `2031:8`、`2031:9` 已在原型约束诊断后移除。旧过渡源、空 probe、已批准母版 `60:7` 和第一检查点结构未修改。
- **Dashboard 科研驾驶舱**：首屏聚焦唯一下一步行动、当前 RO、稳定 ID `OS-RO-01J8YF7Q`、v0.4 私有草稿、Hermes 处理、review/permission 与版本发布结果；普通浏览和社交噪声不进入 actionable task rail，并保留授权只读样例入口。
- **统一 RO Workspace**：同一 RO ID、版本与 Hermes session 贯穿三栏工作台；左栏为 SDF outline/evidence ingress，中栏为 Method 编辑、source anchors、artifact 与 v0.3→v0.4 diff，右栏为 Hermes approval、object context、review、permission/provenance 和任务中心。蓝色继续表达证据/进行中，橙色只表达版本变化。
- **组件与状态契约**：两屏复用 Tabs、RO Card、SDF Node、Artifact Card、Review Row、Version Diff、Hermes Rail 与 Button 本地实例；状态条覆盖 Dashboard/Workspace 的 default、empty、loading、error、success、permission、reduced-motion、a11y、mobile 与 prototype route 规则。
- **最终结构审计**：Dashboard 87 nodes / 10 local instances，Workspace 144 nodes / 15 local instances；两屏均为 1440×900，0 image fills、0 gradients、0 semantic overflow、0 structural sibling overlap，字体仅 Noto Serif SC / Noto Sans SC / Roboto Mono，所有命名操作目标至少 44px。Dashboard 0 orange；Workspace 的三处橙色 paint 均归属于唯一 Version Diff instance `2045:85`。
- **真实原型路径**：`2020:10` Auth/Create 主 CTA 以 200ms dissolve 导向 Dashboard `2031:10`；`2036:17` Dashboard “进入 RO 工作区”导向 Workspace `2031:11`。Landing `2010:24` → Auth/Create 的补链被 Figma 拒绝，Debug UUID `e2c24bcb-14d1-42a0-abaf-eae1e7caeab8`；原因是第一批屏幕仍嵌套在 Frame wrapper 中，而 NAVIGATE destination 要求同页顶层/Section 直接子 frame。无部分写入，本轮不改造已批准第一批结构，作为 Step 9 明确待办。
- **本地恢复证据**：`docs/design-assets/figma/2026-08-09-step9-{dashboard,ro-workspace,cockpit-states}-v1.png`；尺寸分别为 1440×900、1440×900、2960×220，SHA-256 分别为 `8CA0A9CD53CE025C17EBCC9450F15901DADBB9696AE4D221395C824646547746`、`7B828927D44F3B1065FF2F34418FD5FE9D0EB3ABBA4129CAA99C6A27B5A88015`、`F83FE395C2D12F9EE2A53936F86C4FD613259C5CBFF389DEE7CB85E41EEA8981`。
- **安全与范围**：未读取 `.env`，未调用 MiniMax、未生成视频、未修改网页代码或 Code Connect；Step 9 仍为部分完成，不提前勾选。
- **用户门禁**：用户已于本轮明确回复“确认”；Dashboard + RO Workspace 视觉基线冻结，第三检查点 Public RO + Ultrafast Science Collection 解锁。
- **第三检查点启动**：canonical `04 Screens` 已建立顶层 Section `2069:99`、Public RO 空画板 `2069:100`、Ultrafast Science Collection 空画板 `2069:101` 与状态/交互条 `2069:102`；三者尺寸/位置门通过，内容将分屏串行写入，避免 API 中断丢失整批工作。
- **Public RO 完成**：`2069:100` 已采用批准的纸张学术阅读面，左侧复用母版 `37:104` 呈现标题、作者、RO ID、v0.4、Insight、figure/provenance 与具体版本引用；右侧使用 Tabs、Published RO Card、许可/引用契约和 Public Media Artifact，明确 `Published on OpenScience`、作者声明许可与 `Selected by Ultrafast Science · editorial curation ≠ peer-review approval`。
- **Collection 完成**：`2069:101` 复用批准的 `37:143` 期刊编辑母版，展示 journal → volume/issue → section → selected work 层级；右侧以同一 `OS-RO-01J8YF7Q` / v0.4 呈现 Published RO Card、编辑说明、SDF/许可/媒体 readiness 与 `Editorial Curator · scoped` 权限。精选明确是 editorial overlay，不替代作者事实、社区 review 或 RO 演化历史。
- **第三检查点状态与真实路径**：`2069:102` 覆盖 Public RO、Collection、许可/媒体/access、reduced-motion 和原型契约。`04 Screens` 现有 5 条真实 reaction：Auth/Create → Dashboard、Dashboard → Workspace、Dashboard `2033:12` → Public RO、Public RO `2076:152` → Collection、Collection `2074:129` → Public RO；均使用 200ms dissolve，生产 reduced-motion 使用 instant cut。
- **最终审计**：Public RO 1440×900 / 86 nodes / 6 instances，Collection 1440×900 / 71 nodes / 4 instances，状态条 2960×220 / 13 nodes；三者均 0 image fills、0 gradients、批准字体 only，命名操作目标均至少 44px。母版 `37:2` 仍为 1440×1600。
- **本地恢复证据**：`docs/design-assets/figma/2026-08-09-step9-{public-ro,ultrafast-collection,public-states}-v1.png`；SHA-256 分别为 `353682255D974CB928A176A7B7CC88B596F95A7970D95B578CA40B9259832307`、`4A10AEB018F55076E12E6F37A1F9F280AA9E324BD988F83CB53B0398BAF81082`、`48848406C183903F426CC0181E9F96BFE3C8C6931F215AB9A87718320FC909B1`。
- **✅ 用户门禁**：用户已确认第三检查点 Public RO + Ultrafast Science Collection；本轮进入网页实现，不再等待 Figma 结构补链。
- **⏳ 下一步**：将已批准六屏语义映射到现有 Next.js，先实现 Landing evidence field、Dashboard 驾驶舱与 RO Workspace chrome，再做页面级测试、截图与 docs-sync；Landing → Auth/Create 的 Figma direct-child 补链保留为独立后续项。

## 2026-08-08（产品网页 Task 1 / Step 9 第一检查点）— Landing + Auth/Create 已获用户确认

- **Figma 交付**：只在长期账号 canonical 文件 `gjhowMG7cG4clKwvhvF08E` 的 `04 Screens` 写入 wrapper `2009:3`、屏幕行 `2009:4`、状态契约条 `2009:5`；Landing 为 `2010:2`，Auth/Create 为 `2012:4`。旧过渡源与空 probe 未修改。
- **Landing 保真复用**：`2010:2` 从用户已批准的 `03 Patterns` 母版 `60:7` 精确克隆；源母版保持 1440×900、节点结构与名称不变。Landing 继续以稳定 RO ID、PAPER/DATA/CODE 证据汇入、六段研究对象和单一版本变化语义讲述产品主张。
- **Auth/Create 产品流程**：`2012:4` 合并邀请身份与轻量创建入口，包含材料优先叙事、PAPER/DATA/CODE、隐私与 provenance、预留 RO ID、标题/材料输入、Hermes 解析或空白六字段两种入口、七维处理范围披露、确认 CTA 与候补路径；字段保持克制，不要求作者先填完论文。
- **状态与可读性**：画布外状态条覆盖 DEFAULT / LOADING / ERROR / SUCCESS / PERMISSION / REDUCED MOTION；处理范围关键披露从 9px 提升为 10px 并扩至 592×45，保持三行无溢出。
- **结构审计**：两屏均为 1440×900；0 图片填充、0 渐变、Auth/Create 0 橙色、0 语义溢出、按钮最小 44px、字体仅 Noto Serif SC / Noto Sans SC / Roboto Mono；复用 Button/Input 本地实例，157 个节点绑定本地变量。Landing 仅保留已批准的裁切氛围 bloom 与版本 diff 橙色。
- **本地恢复证据**：`docs/design-assets/figma/2026-08-08-step9-entry-{landing,auth-create,states}-v1.png`；远程短期截图 URL 未写入仓库。
- **安全与范围**：未读取 `.env`，未调用 MiniMax、未生成视频、未新增 Code Connect、未修改网页代码；Task Master 任务 10 维持 `in-progress`，完整设计事实仍以 product web spec / plan / Figma canonical 为准。
- **用户门禁**：用户已于本轮明确回复“确认”；Landing + Auth/Create 视觉基线冻结，第二检查点 Dashboard + RO Workspace 解锁。
- **⏳ 下一步**：只在 `04 Screens` 继续 Dashboard + RO Workspace，并在第二检查点建立主 CTA 的真实原型目标。Step 9 仍为部分完成，不提前勾选。

## 2026-08-08（产品网页 Task 1 / Figma canonical 迁移验收）— 长期账号副本通过 parity，Step 9 解锁

- **canonical 文件**：用户在长期账号下手动复制最新设计，新文件为 `gjhowMG7cG4clKwvhvF08E`；自本 checkpoint 起作为唯一设计事实源。旧源 `rWS3seZaDMdlnSljqktMDp` 与空探针 `PBUlumyHBVXfMHgdopH0aB` 只读保留，不再承载新增设计或 Code Connect。
- **账号与写权限**：`figma-primary whoami` 确认为长期账号，目标 Team 席位为 Full；在 `00 Cover` 创建后立即删除 1×1 probe，前后 child count 均为 0，证明可编辑且画布净零变化。
- **迁移 parity**：源/副本均为 6 pages、4 collections / 85 variables、9 text styles、2 effect styles、12 component sets / 96 variants；关键 nodes `60:2`、`60:7`、`60:8` 名称与 1974×1044、1440×900、390×844 尺寸一致；字体集合均为 Noto Sans SC / Noto Serif SC / Roboto Mono，image fill count 均为 0；prototype 均为 0 reactions / 0 flow starts。
- **Code Connect 限制**：源/副本的官方 `get_code_connect_map` 都返回 plan gate，要求 Organization/Enterprise 的 Dev 或 Full seat；长期账号当前是 student tier 的 Full。不能声称映射已迁移或为空，该限制单独阻塞 Step 11，不阻塞 Step 9。
- **门禁结论**：ADR-004 的可检查迁移门通过，实施计划 Step 9 仍为未开始，但已允许只在 canonical 文件中启动六屏原型。
- **安全与范围**：未读取 `.env`，未打印账号凭据/OAuth token，未修改网页代码；Figma 唯一写动作是已回滚的净零探针。
- **⏳ 下一步**：在 canonical 文件 `gjhowMG7cG4clKwvhvF08E` 启动 Step 9，先建立 Landing、Auth/Create、Dashboard、RO Workspace、Public RO、Ultrafast Science Collection 六屏的页面骨架与点击流。

## 2026-08-08（产品网页 Task 1 / Step 8 完成与 Figma 迁移门）— 组件获批，Step 9 暂停

- **用户确认**：用户明确确认 Version Diff、Hermes Rail 与 Step 8 全量审计结果；实施计划 Step 8 已勾选完成。
- **长期账号写入探针**：`figma-primary` 身份正确，并成功在长期账号目标 Team 创建空 Design 文件 `PBUlumyHBVXfMHgdopH0aB`，证明目标侧可以写入。该文件当前为空且仅作迁移探针，不是 canonical。
- **阻塞根因**：长期账号访问过渡源 `rWS3seZaDMdlnSljqktMDp` 时官方 MCP 明确返回无 edit access；官方 MCP 不提供 share/duplicate/move/ownership-transfer，且不能以截图或扁平 SVG 保真迁移 variables/components/prototype。
- **门禁**：Step 9 六屏原型暂停。需要源所有者在 Figma UI 将长期账号设为 Editor，再由长期账号 Move/Duplicate 到目标 Team；之后对照 6 pages、4 collections、85 variables、9 text styles、2 effect styles、12 sets、96 variants 与关键 master nodes。
- **安全与范围**：未读取 `.env`，未打印密码/OAuth token，未删除或修改过渡源；空目标文件保留为可恢复探针。
- **⏳ 下一步**：用户完成一次 Figma UI Editor 共享后通知本会话；先复核 edit，再完成 duplicate/move 与全量 parity，迁移通过前不继续设计。

## 2026-08-08（产品网页 Task 1 / Step 8 最后一批组件）— Version Diff、Hermes Rail 已建立，全量审计通过

- **Figma 交付**：`02 Components` 新增 wrapper `86:7`；Version Diff `86:47`（Added/Removed/Changed × Paper/Dark 6 variants）、Hermes Rail `86:106`（Idle/Working/Approval/Complete × Paper/Dark 8 variants）。Hermes 与 Live2D 共用同一 intent/status/permission/version 模型。
- **全量组件审计**：`02 Components` 共 12 个预期 Component Set、96 个 variants；0 missing、0 duplicate set name、0 图片填充、0 placeholder。字体仍限定 Noto Sans SC / Noto Serif SC / Roboto Mono。
- **颜色语义修复**：旧 Button specimen 的 `29:8 ro-node-1` 从 accent-diff 橙色改为 evidence 蓝并更名 `evidence-node`；余下所有 accent-diff owner 均属于 diff/change 语义。Version Diff 仅 Changed 使用橙色，Added 使用证据蓝，Removed 使用危险红。
- **本地证据**：`docs/design-assets/figma/2026-08-08-step8-change-hermes-v1.png`，SHA-256 `247F71E29B2768C2F93191036F178B4E0753B5FC8BDB6C2A3AF6A5B648CDCD8C`。
- **⏳ 下一步**：用户确认最后一批视觉后，勾选 Step 8 完成并进入 Step 9 六屏原型；Tabs 与新 domain components 的代码实现仍作为后续 implementation backlog，不在 Figma 阶段提前修改。

## 2026-08-08（产品网页 Task 1 / Step 8 第三批组件）— 用户确认通过

- **批准结论**：用户明确回复“确认”，SDF Node、Artifact Card、Review Row 的状态颜色、真实 artifact 字段与可逆 review 契约通过批次门。
- **解锁范围**：允许继续最后两组 Version Diff、Hermes Rail；完成后回收 Step 8 总体验收并同步组件缺口。
- **⏳ 下一步**：在 Figma `02 Components` 串行建立 Version Diff 与 Hermes Rail，随后运行全量组件集合审计。

## 2026-08-08（产品网页 Task 1 / Step 8 第三批组件）— SDF Node、Artifact Card、Review Row 已建立

- **Figma 交付**：`02 Components` 新增 wrapper `82:7`；SDF Node `82:67`（Idle/Active/Verified/Blocked × Paper/Dark 8 variants）、Artifact Card `82:112`（Paper/Data/Code × Paper/Dark 6 variants）、Review Row `82:151`（Open/Accepted/Needs changes × Paper/Dark 6 variants）。
- **语义边界**：SDF Blocked 与 Review Needs changes 使用 `state-danger`；本批不使用 accent-diff 橙色，避免把版本变化与审阅风险混为一谈。Artifact 文件名沿用真实 `source.pdf`、`transient-absorption.csv`、`fit_decay.py`。
- **审计**：3 个 Component Set 属性与 variant 数量正确；0 图片填充、0 placeholder、0 wrapper 越界；字体仅 Noto Sans SC / Noto Serif SC / Roboto Mono；橙色 diff 节点数量为 0。
- **本地证据**：`docs/design-assets/figma/2026-08-08-step8-research-workflow-v1.png`，SHA-256 `4542D644E053D28E2F3974FFBEBF62FC5CD279E4DA86A5F11B55380188149D89`。
- **⏳ 下一步**：用户确认第三批视觉后，继续 Version Diff 与 Hermes Rail；随后回收 Step 8 组件总体验收并进入六屏原型准备。

## 2026-08-08（产品网页 Task 1 / Step 8 第二批组件）— 用户确认通过

- **批准结论**：用户明确回复“确认”，Dialog、Tabs、RO Card 的视觉、surface/context 关系、Tabs code gap 标注和 RO 生命周期契约通过批次门。
- **解锁范围**：允许继续第三批 SDF Node、Artifact Card、Review Row；Version Diff 与 Hermes Rail 仍保留到下一检查点。
- **⏳ 下一步**：在 Figma `02 Components` 串行建立第三批三组组件，完成后保存截图、结构审计并同步 handoff。

## 2026-08-08（产品网页 Task 1 / Step 8 第二批组件）— Dialog、Tabs、RO Card 已建立

- **Figma 交付**：`02 Components` 新增 wrapper `78:7`；Dialog `78:33`（Paper/Dark 2 surfaces）、Tabs `78:116`（Overview/SDF/Artifacts/Versions × Paper/Dark 8 variants）、RO Card `78:173`（Draft/Review/Published × Paper/Dark 6 variants）。
- **接口诚实性**：Dialog 只映射现有 `DialogContent surface`；风险等级由组合内容表达，不新增虚假 prop。Tabs 明标 `ui/tabs.tsx` code gap。RO Card 是待实现 domain contract，unique ID 在三状态与两表面保持不变。
- **视觉与语义修复**：展示板由 1780 增至 1900 px，避免底部 RO Card/说明拥挤；Draft 灰点从 `Diff` 改名 `Status Anchor`，橙色继续仅表示 Review/Published 快照变化。
- **审计**：3 个 Component Set 的 variant/property 数量正确；0 图片填充、0 placeholder、0 wrapper 越界；字体仅 Noto Sans SC / Noto Serif SC / Roboto Mono。
- **本地证据**：`docs/design-assets/figma/2026-08-08-step8-navigation-domain-v1.png`，SHA-256 `A845FA89B43D55EEE9262FA5C3EE22BC8493934CC5207595F576D7F6CA621B5B`。
- **⏳ 下一步**：用户确认第二批视觉后，继续 SDF Node、Artifact Card、Review Row；Version Diff 与 Hermes Rail 保持下一检查点。

## 2026-08-08（产品网页 Task 1 / Step 8 首批组件）— 用户确认通过

- **批准结论**：用户明确回复“确认”，Card、Badge、Input 的视觉、双表面关系与属性契约通过批次门。
- **解锁范围**：允许继续第二批 Dialog、Tabs、RO Card；其余 domain families 仍等待第二批截图检查，不一次性铺开。
- **⏳ 下一步**：在 Figma `02 Components` 串行建立第二批三组组件，完成后保存截图、结构审计并同步 handoff。

## 2026-08-08（产品网页 Task 1 / Figma v3 原生母版）— 用户视觉确认通过

- **批准结论**：用户审阅 1440×900 桌面与 390×844 移动截图后明确回复“确认”；产品设计 spec §11.4.6 与实施计划 Step 7.7 已由待验收更新为完成。
- **解锁范围**：允许继续 Step 8 组件家族和 Step 9 六屏原型；网页代码仍等待 Figma 组件契约与六屏原型复核，不因本次确认提前启动。
- **事实源**：Figma 节点保持 wrapper `60:2`、desktop `60:7`、mobile `60:8`；本地证据保持 `docs/design-assets/figma/2026-08-08-native-v3-{desktop,mobile}.png`。
- **⏳ 下一步**：对账 Figma 现有 Button 集合、代码 `apps/web/components/ui/*` primitives 与计划要求的 Card/Badge/Input/Dialog/Tabs/RO Card/SDF Node/Artifact Card/Review Row/Version Diff/Hermes Rail，先形成缺口再串行构建。

## 2026-08-08（产品网页 Task 1 / Step 8 首批组件）— Card、Badge、Input 已建立，等待批次确认

- **Figma 交付**：`02 Components` 新增 wrapper `76:7`；Card `76:25`（Paper/Dark 2 contexts）、Badge `76:44`（Default/Secondary/Destructive/Outline × Paper/Dark 8 variants）、Input `76:61`（Default/Focus/Disabled × Paper/Dark 6 variants）。真实代码 API 未被扩展，Context 只记录 CSS surface ancestry。
- **审计**：组件集合数量与属性定义可读取；0 图片填充、0 placeholder、0 wrapper 越界；字体仅 Noto Sans SC / Noto Serif SC / Roboto Mono。Badge 的橙色未用于任何状态，保持 diff 专属语义。
- **本地证据**：`docs/design-assets/figma/2026-08-08-step8-core-primitives-v1.png`，SHA-256 `8D38FF236A06DBA8F5C3EE56153A192660EE454952D1D4D1F5AC491E50B17356`。
- **⏳ 下一步**：用户确认这一批视觉后，继续 Dialog、Tabs 与 RO/Artifact/Review/Version/Hermes domain families；确认前不增加组件数量。

## 2026-08-08（产品网页 Task 1 / Figma v3 原生母版）— 双尺寸已完成，等待视觉确认

- **Figma 交付**：`03 Patterns` 新增统一包裹节点 `60:2`、桌面 `60:7`（1440×900）与移动 `60:8`（390×844）。桌面把早期花瓣式 RO 改为证据账本，原生呈现 unique ID、六类 SDF、连续度、`v0.4` 与单一 diff；移动端按 spec 独立重排，并将三类 artifact 修正为纵向 evidence ingress。
- **截图证据**：`docs/design-assets/figma/2026-08-08-native-v3-desktop.png`（SHA-256 `4A967111ED83550114EE2F97DD0E5F85E409C7CEE9C896862CA95EACE552AA23`）与 `2026-08-08-native-v3-mobile.png`（SHA-256 `E984375BD057A8A29E02D0FDFB74AB8C257F01A901A0B7152155EFA5506DDFB8`）已本地固化，避免依赖短期 Figma asset URL。
- **结构门禁**：两端均为 0 图片填充、0 占位节点、0 语义内容越界、0 小触控目标；字体限定 Noto Serif SC / Noto Sans SC / Roboto Mono；每端恰有 1 个橙色版本差异点。移动端仅无语义模糊环境光被主动裁切。
- **任务状态**：Task Master 的 `10 Figma Design Upstream + MCP Integration` 已由 `pending` 更新为 `in-progress`；视觉批准、组件映射与 Code Connect 尚未完成，因此未标记 done。
- **安全与范围**：未读取 `.env`、未调用 MiniMax、未导入 rejected v1/v2、未修改网页代码。Figma 写入严格串行，并在每次主要修订后截图复核。
- **⏳ 下一步**：请用户对桌面/移动截图做视觉确认；批准后才勾选计划 Step 7.7，并进入组件家族与六屏原型，网页实现仍不提前开始。

## 2026-08-08（产品网页 Task 1 / v3 路线批准）— Figma 原生母版已解锁

- **用户决策**：用户回复 `1`，正式批准路线 1 与产品设计 spec §11.4；整幅 AI 背景退出交付链，v3 使用 Figma/CSS/SVG 原生确定性母版。
- **实施门**：允许在现有 Figma 文件 `03 Patterns` 严格串行构建 1440×900 桌面母版与 390×844 移动重排，并按十项拒绝门截图验收。
- **仍受限范围**：不得导入 rejected MiniMax v1/v2，不得再次付费生成；网页代码仍需等待两张 Figma 截图获用户审美批准后才可修改。
- **⏳ 下一步**：加载官方 `figma-use` 指令，先搜索现有 variables/styles/components，再构建桌面与移动母版；每一幅完成后截图、审计并同步节点 ID。

## 2026-08-08（产品网页 Task 1 / v3 原生母版设计切片）— 精确 spec 待批准

- **设计切片**：在唯一产品设计 spec §11.4 写入路线 1 的可实施版本：1440×900 四区坐标、390×844 独立重排、七层语义所有权、4.2 秒一次性证据汇入时间轴和十项静态/响应式/无障碍/性能拒绝门。
- **关键修正**：整幅 AI 背景退出交付链；现有 RO loop/poster、unique ID、artifact、SDF、路径、版本和 CTA 均保持原生。当前 `hero-ambient` 的星点/星尘不得进入 v3；被拒绝的 MiniMax v1/v2 只保留 provenance。
- **产品叙事**：桌面与移动均必须在无动画时读出“真实 artifact → 同一个 RO → v0.4 新版本”；Live2D/Hermes 只复用同一高亮 intent，不建立第二套状态。
- **范围**：本步骤只修改设计/计划/进度/索引/handoff 文档；未改代码或 Figma，未加载 `.env`，未调用 API。
- **⏳ 下一步**：用户选择路线 1 并批准 §11.4 后，才把该切片转成 Figma `03 Patterns` 原生母版与桌面/移动截图；批准前不实施。

## 2026-08-08（产品网页 Task 1 / v3 路线只读预检）— 原生确定性母版可直接复用

- **代码证据**：`apps/web/components/landing/Hero.tsx` 已把 ambient、左侧可读性 veil、右侧 RO loop/poster、版本标签、CTA 与移动端/reduced-motion 回退分层；`apps/web/scripts/generate-landing-hero.mjs` 已能以 SVG + Playwright 确定性输出原生主视觉，不需要让图片模型控制整幅构图。
- **资产证据**：`hero-ambient`、`landing-hero.png`、`ro-loop-poster.webp` 与对应视频均已版本化存在。现有 ambient 的星尘感需要移除或降级，但 RO 位置、蓝色证据线和橙色 diff 语义可复用。
- **Figma 证据**：过渡文件 master `37:2` 的深色 Workspace、纸白 Public RO、Ultrafast Science 策展三表面已经建立统一 RO ID/版本叙事；下一步应精修暗色主视觉材料与证据汇入，不需要重做整体产品方向。
- **边界**：本预检只读取本地代码/资产和 Figma 截图；未修改代码或 Figma，未加载 `.env`，未调用 MiniMax。路线 1（原生确定性母版）仍是推荐项，但必须等待用户选择后才实施。
- **⏳ 下一步**：用户从路线 1/2/3 中确认 v3 策略；确认前不生成新资产、不导入 rejected v2。

## 2026-08-08（产品网页 Task 1 / v2.1 静态验收）— 调用成功，视觉拒绝

- **单次恢复调用**：提交 `2ebd1ae` 后按计划执行一次中国区 `image-01` 请求；key1 成功，未触发 key2、未重试。产出 1280×720 PNG（SHA-256 `5C159F116C5AA4FC0E57F816F07C73705B17BBBED0F4A87F20C9086F8A61DF7A`）和脱敏 provenance。
- **provenance 门**：sidecar 记录 `model=image-01`、`region=cn`、`keySlot=key1`、1440 字符 prompt 和真实 intended surface；不含远程 URL、签名查询参数或 key 值。
- **静态拒绝门**：左侧存在高亮玻璃/金属结构；画面形成居中对称隧道及发光矩形台座；有漂浮粒子；上下为可见硬黑边；中心焦点会与原生 RO 竞争，移动端中心裁切也不安静。未通过门 1、3、5、6、7，并违反 no-particles、centered-subject 和 rectangular-vignette 约束。
- **处置**：`openscience-evidence-chamber-v2.png` 与 sidecar 作为可追溯 rejected exploration 保留；不得导入 Figma、不得派生 H3 视频、不得在未批准 v3 方向前再次付费生成。
- **⏳ 下一步**：向用户展示原图与逐门结论，重新锁定 v3 的生成策略；优先考虑降低模型构图自由度或改为原生 CSS/SVG 材料场，而不是继续追加负向词。

## 2026-08-08（产品网页 Task 1 / v2.1 prompt 批准）— 1440 字符，恢复调用尚未执行

- **用户确认**：用户以选择 `1` 确认上轮展示的 v2.1 精确正负提示词；活跃 Markdown 已原地更新，未新建第二份 prompt。
- **长度证据**：实际 `buildImagePrompt` 组合结果为 1440 字符（正向 921、负向 495，另含固定连接文本），低于 MiniMax 严格 1500 字符上限并保留 59 字符余量。
- **设计边界**：继续锁定四区构图、生成/原生职责分离、70% 安静暗场、单一冷光和无橙色；RO、SDF、ID、版本、artifact、路径及 UI 仍由原生图层承担。
- **安全状态**：本步骤未加载 `.env`、未发出 API 请求、未生成文件、未切换 key，也未触碰 Figma。
- **⏳ 下一步**：提交本次唯一输入变更后，重新确认 v2 PNG/sidecar 不存在，再按计划 Step 7.5 只执行一次中国区恢复调用；任何非 1008 错误立即停止。

## 2026-08-08（产品网页 Task 1 / MiniMax 长度 preflight）— 本地契约已提交，等待 prompt 压缩批准

- **TDD 证据**：先在 `scripts/design/prompt-manifest.test.mjs` 增加 final combined prompt 的边界用例；`node --test scripts/design/prompt-manifest.test.mjs` 预期 RED（1500 字符未抛出异常），最小实现后 `node --test scripts/design/minimax-client.test.mjs scripts/design/prompt-manifest.test.mjs scripts/design/generate-minimax-image.test.mjs` GREEN，23/23。
- **本地 API 契约**：`buildImagePrompt` 在合并正负区块后，准确接受 1499 字符并在 1500 字符时以 `Combined MiniMax image prompt must be fewer than 1500 characters` 失败。该纯函数发生在 CLI 加载 key、构造 client 和任何 HTTP 调用之前。
- **范围与安全**：未读取或打印 `.env`，未发出网络/API 请求，未修改批准的 prompt Markdown，也未触碰 Figma。Step 7.4b（压缩、记录长度、用户批准）及后续步骤仍未开始。
- **⏳ 下一步**：仅执行 Step 7.4b：在保持批准责任边界的前提下压缩 prompt 至最多 1499 字符，并由用户复核精确文本；批准前禁止新的 live call。

## 2026-08-08（产品网页 Task 1 / v2 生成长度门）— 官方 2013，未产出资产

- **实现审查完成**：Step 7.1–7.4 提交 `e731720`，task reviewer 发现任意 prompt 路径与 `--prompt=...` 两项问题；fix round 1 提交 `f8aad63` 后 scoped re-review 全部 `ADDRESSED`。主会话复验 21/21，`docs:lint` 0 问题、`DOCS_SYNC_OK`、敏感扫描干净。
- **单次调用结果**：按批准命令向中国区 `image-01` 发出一次请求，key1 返回 HTTP 200 + MiniMax `2013 invalid params`，诊断为 prompt 必须少于 1500 字符。未切 key2、未自动重试、未生成 PNG 或 provenance sidecar。
- **根因**：批准 Markdown 的正负区块合并后为 2018 字符，超出严格上限 519；manifest/CLI 只验证区块和来源，没有在加载凭据/发出请求前验证最终 payload 长度。
- **恢复门**：先以 TDD 增加 1499 接受、1500 拒绝的本地长度契约，再把 prompt 压缩到不超过 1499 字符并由用户复核。两项通过前禁止第二次请求。

## 2026-08-08（产品网页 Task 1 / v2 prompt manifest）— 付费生成前的输入与 provenance 边界已提交

- **TDD 证据**：新增 manifest/CLI 契约后，`node --test scripts/design/minimax-client.test.mjs scripts/design/prompt-manifest.test.mjs scripts/design/generate-minimax-image.test.mjs` 先 RED（缺少 `prompt-manifest.mjs`，CLI 仍要求旧 `--prompt`），最小实现后 GREEN；review fix 后为 21/21。
- **批准 prompt 单一事实源**：`scripts/design/prompt-manifest.mjs` 只提取批准 Markdown 中 `## MiniMax Prompt` 与 `## Negative Prompt` 下的首个 `text` fenced block，按官方图片 API 的单一 `prompt` 约束合并；缺少任一块时固定失败。
- **CLI/provenance 边界**：生成器要求显式 `--prompt-file` 与 `--intended-surface`，在环境或网络工作之前拒绝缺项，并明确拒绝 inline `--prompt`。组合后的 prompt 发送给客户端，调用方提供的 intended surface 写入脱敏 sidecar。
- **安全与范围**：本切片没有读取 `.env`、没有网络/API 调用、没有生成资产、没有触碰 Figma；任意 prompt 路径和两种 inline prompt 形式均在读取/凭据/网络前拒绝。后续真实调用因长度契约停止，见最新条目。

## 2026-08-08（产品网页 Task 1 / 静态资产审美门）— v1 被拒绝，回到产品语义重新锁定

- **用户结论**：`openscience-observatory-v1.png` 与既有 OpenScience 视觉系统不一致，不能只追求抽象科研质感，生成资产必须直接服务产品网页计划。
- **根因**：v1 prompt 同时要求模型生成“材料场”和“六节点 RO 结构”，与产品 spec §11.2 的职责边界冲突。模型由此把不可妥协的六节点语义退化成植物状抽象图，也没有表达 RO unique ID、SDF 元数据、版本锚点及跨 Landing / Workspace / Public RO / Ultrafast Science 的连续关系。
- **处置**：v1 保留为有 provenance 的 rejected exploration，不导入 Figma、不生成其视频版本。下一轮先确认生成层职责；默认修正方向是 MiniMax 只生成可裁切的科研材料/证据纹理，精确六节点、ID、SDF、轨迹和 diff 全部由 Figma/SVG 原生叠加。
- **职责选择已确认**：用户接受推荐项 A，下一张资产首先服务 Landing / Workspace 暗色主视觉。现有精确蓝色玻璃六面 RO 环继续作为原生品牌锚点；MiniMax 不再生成 RO 几何，只提供与其匹配的深墨科研空间、材料质感和受控光场。
- **构图选择已确认**：用户从三案中批准方案 1「证据汇入」：精确 RO 环位于右侧，研究材料从左侧沿受控路径进入同一个 RO，橙色只标记一次版本变化。生成层只承担空间、纹理和光，材料卡、轨迹、SDF 状态与 RO ID 均由原生层表达。
- **布局与图层职责已确认**：16:9 画面锁定为左侧 0–40% 叙事留白、中部 38–62% 证据汇入走廊、右侧 54–105% 原生 RO 品牌锚点、底部 72–100% 向 `#03060b` 收拢。MiniMax 仅提供深墨空间、非数据化微纹理、定向体积光与反射；六节点、轨迹、RO ID、版本、artifact、SDF 与 Hermes 状态全部保持原生可编辑。
- **材料与光线已确认**：生成背景采用 `Precision Evidence Chamber`：`#03060b` / `#08101c` 深墨空间、黑色阳极氧化金属、烟熏光学玻璃、微蚀刻表面和少量半透明薄膜；单一冷色光沿左中部指向右侧 RO，约 70% 保持安静暗场。高饱和 `#4c8dff` 与全部 `#ffb454` 留给原生轨迹/diff；生成层禁止 RO 几何、花/脑/DNA/星空、HUD、假 UI/数据、纸张手绘、紫色霓虹与随机粒子。
- **叙事与验收门已确认**：合成画面按 artifact 汇入、蓝色路径连接、六面依次响应、单个橙色版本变化、RO ID/版本锚点的顺序讲述产品故事；静态背景须通过八项拒绝门。未来 H3 只允许固定镜头下的低亮度冷色反射移动，产品语义继续由原生动画承担。
- **书面设计已批准**：用户复核并确认 `docs/design-assets/prompts/2026-08-08-living-research-observatory-v1.md` v2。官方图片 API 字段复核发现没有独立 `negative_prompt`；执行计划因此先加入 `--prompt-file` TDD，将正负区块合并为单一 API prompt，并把 `intendedSurface` 从旧硬编码改为必填参数。
- **⏳ 下一步**：按计划 Step 7.1–7.4 完成无网络接口修复和提交，再执行一次 Step 7.5 中国区 `image-01` 生成；失败时不自动重试或改 prompt。

## 2026-08-08（产品网页 Task 1 / MiniMax 中国区生成）— 双 key 有效，首张静态资产等待审美门

- **根因定论**：key1 与 key2 均为有效的中国区 Token Plan Subscription Key；此前 `2049 invalid api key` 是把 CN key 发送到 global `api.minimax.io` 所致。中国区只读验证应使用 `api.minimaxi.com` / `www.minimaxi.com`，图片生成使用 `https://api.minimaxi.com/v1/image_generation`。
- **单次生成成功**：按 key1 优先策略显式传入 `--region cn`，`image-01` 成功生成 1280×720 静态科研证据场 `docs/design-assets/generated/openscience-observatory-v1.png`；未触发 key2，未执行视频生成。素材为暖白纸张底、克制青绿色证据轨迹、橙色版本痕迹与右侧开放六节点结构，保留可叠加真实 Figma UI 的负空间。
- **安全收尾**：`b655257` 将 provenance 改为白名单字段，禁止持久化远程图片 URL、查询参数或临时签名，并原地脱敏已有 sidecar。`node --test scripts/design/minimax-client.test.mjs scripts/design/generate-minimax-image.test.mjs` 为 14/14，签名 URL 敏感扫描干净。
- **⏳ 下一步**：由用户审美确认该图是否作为低对比度材料层；批准后才导入 Figma `03 Patterns` 的 `Living Research Observatory` 母版并启动 H3 视频动效门，未批准则一次只改一个 prompt 变量。

## 2026-08-08（产品网页 Task 1 / MiniMax 设计资产客户端）— 可复用静态生成边界已就绪

- **TDD 证据**：先新增 `scripts/design/minimax-client.test.mjs`，`node --test scripts/design/minimax-client.test.mjs` 预期 RED（`ERR_MODULE_NOT_FOUND`，客户端尚未存在）；最小实现后同一命令 GREEN，7/7 通过且不发出网络请求。
- **客户端边界**：`scripts/design/minimax-client.mjs` 固定调用 `image-01` 的单图 URL 接口；key1 优先，既有运行时 key 仅兼容为 key1；只有 HTTP 成功响应中 MiniMax `base_resp.status_code=1008` 才尝试 key2。授权、限流、参数、安全、网络、解析和质量错误均不切换，所有结果/错误仅保留脱敏槽位和官方诊断。
- **安全 CLI 与提示清单**：`scripts/design/generate-minimax-image.mjs` 只经 Node 进程环境接收凭据、拒绝覆盖，输出限定在 `docs/design-assets/generated/` 并写不含密钥的 provenance；`docs/design-assets/prompts/2026-08-08-living-research-observatory-v1.md` 锁定 `stylized-concept` 约束与拒绝门。本切片未进行付费生成、未创建资产、未触碰 Figma。
- **⏳ 下一步**：由控制方决定是否显式运行一次 live generation，原图须经审美批准后才能导入 Figma 母版。

## 2026-08-08（产品网页视觉母版）— 「科研观测台」方向批准，进入静态资产与 Figma 母版

- **审美复盘**：现有 Button specimen 结构合格但仍偏设计系统说明书；已有视觉素材在简化线框与蓝色科幻装置之间摇摆，缺少统一的学术编辑气质、真实信息密度和材料层次。
- **方向批准**：用户批准 `Living Research Observatory`（科研观测台）作为 `Monumental Scholarly Intelligence` 的具体表达：学术编辑设计为主体，克制的 RO 演化装置作为品牌记忆。
- **资产策略**：静态概念图候选为 MiniMax `image-01`；静态母版通过后优先尝试官方当前最新的 `MiniMax-H3` 视频接口（无权限时才记录原因并回退 `MiniMax-Hailuo-2.3`），目标 5–6 秒、2K/1080P 动效母版。生成模型只负责科研空间、纹理、poster/视频母版；文字、节点、图表和 UI 保持原生可编辑。
- **密钥策略**：设计资产生成严格按 key1 → key2 有序回退；仅明确额度/余额类错误允许切 key2。不得读取、打印或记录密钥值；该规则不改变产品运行时 AI Gateway。
- **Spec 同步**：上述规则已增补至 `docs/specs/2026-08-08-openscience-product-web-design.md` §11.1–11.3，用户已复核确认；下一步先完成双 key 路由测试、静态概念资产和跨 Landing/Workspace/Public RO 的 Figma 母版。
- **静态生成门**：Figma 母版已完成并通过内部截图几何检查；MiniMax 客户端切片 `6fc04a1` 已通过任务级审查。当前准备一次 `image-01` 生成尝试，输出使用新版本路径与 provenance sidecar，不覆盖已有资产。
- **生成尝试 1**：隔离 worktree 内无 `.env`，Node 在本地启动阶段退出，未到达 MiniMax、未扣费、未触发 key2。下一次由 Node 直接加载主工作区 `E:/Miscellaneous/XGS/.env`，不复制、不读取或回显文件内容。
- **生成尝试 2 / 根因**：Node 已加载主工作区 `.env`，但客户端未匹配新 key1/key2 的变量命名，仍在本地配置校验阶段退出；未发出 API 请求。根因是环境变量命名契约不兼容，不是 key 有效性或 MiniMax 服务问题；下一步以 TDD 增加常见 `_1/_2` 与 `KEY1/KEY2` 别名。
- **生成尝试 3 / 外部证据**：别名修复后真实请求到达 MiniMax，返回 HTTP `200`、官方 `2049 invalid api key`，槽位为 `key1`。按已批准策略不切换 key2、不重试认证错误；没有资产或 provenance 产物。下一步需先修正 key1，再重新执行单次 live generation。
- **Token Plan 诊断闭环**：官方 Token Plan 文档确认支持的统一额度覆盖图片/视频，且应使用 Billing > Token Plan 的 Team 专属 Subscription Key。使用 key1 调官方只读 `/v1/token_plan/remains` 仍返回 `2049`；本地脱敏检查确认 key 无 `Bearer` 前缀、外层空白、引号或换行。根因收敛为 Subscription Key 已失效/重置、复制错误，或不属于当前有席位/额度的 Team；修复后应先验证 remains 返回状态 0，再重试图片生成。
- **Key2 只读验证**：经用户明确授权，使用 `MINIMAX_API_KEY2` 调同一 Token Plan remains 接口；HTTP `200`、官方状态仍为 `2049 invalid api key`。key2 本地格式同样无 Bearer 前缀/空白/引号/换行，未执行任何图片或视频生成。结论：两项存储值均需从有效 Team 的 Billing > Token Plan 页面重新复制或 reset。
- **区域根因更正（取代上一结论）**：用户确认 key2 有效后重新核对官方 Token Plan 区域规则，发现中国区应使用 `api.minimaxi.com`，而此前所有验证都错误发送到全球 `api.minimax.io`。key2 调 `api.minimaxi.com/v1/models` 返回 HTTP 200 与模型数据，调 `www.minimaxi.com/v1/token_plan/remains` 返回 HTTP 200、状态 0 与计划数据；key2 有效。根因是 CN Subscription Key 与 global endpoint 不匹配，不是 key 失效。下一步以 TDD 为生成器增加 `cn/global` host 选择，再执行单次图片生成。
- **区域修复完成**：`658cafe` 以 TDD 增加显式 `--region cn|global`、中国区 `api.minimaxi.com` 图像 host 与 region/host provenance，相关测试 12/12。随后 key1 的中国区 remains 也返回 HTTP 200、状态 0 与计划数据；两把 key 均有效。下一步仅执行一次 `--region cn` 的版本化 `image-01` 请求，key1 优先且仅官方 1008 才切 key2。

## 2026-08-08（产品网页 Task 1 / Figma Phase 1–3）— Foundations 完成，Button 视觉检查待确认

- **隔离执行**：用户授权创建 `.worktrees/product-web-task1`，当前分支 `codex/product-web-task1`，基线提交 `2ed0c50`。
- **代码 token 真源**：`apps/web/app/tokens.css` 新增 9 级 spacing、4 级 radius、Noto Serif/Sans 双字体族、9 级字号/行高和 4 级 tracking；`globals.css` 的 drawer 改用 `--z-overlay`，正文统一消费 `--font-ui`。
- **TDD 证据**：新增契约先出现 4 个预期失败，再实现为 13/13 通过；`npx pnpm@9.15.0 --filter @openscience/web typecheck` 与 `build` 均通过。
- **Figma Foundations**：过渡设计源现有 4 个集合、85 个 variables、13 条 alias、9 个 Text Styles、2 个 Effect Styles；审计为 `ALL_SCOPES=0`、缺失 Web code syntax=0、broken alias=0。
- **文件结构**：建立 `00 Cover`、`01 Foundations`、`02 Components`、`03 Patterns`、`04 Screens`、`99 Archive` 六页。
- **Button 检查点**：主集合按 React API 建立 30 variants（5 variant × 3 size × 2 disabled）并暴露 Label 属性。用户确认功能结构但认为美感不足后，specimen 重构为深色科研仪器 hero + 五种 CSS interaction states + 5×6 属性矩阵 + Code Contract；加入语义化 RO 六节点轨道/证据线/diff node，未改变组件 API。结构审计为 30 variants、5 states、0 overlap、0 duplicate top-level name，等待用户确认新版美感。

## 2026-08-08（产品网页 Task 1 / Figma Phase 0）— 过渡文件创建与 discovery 完成

- **设计源创建**：用户确认后，在临时 Full 席位的 `501428005's team` 创建 `OpenScience Web Design System`：<https://www.figma.com/design/rWS3seZaDMdlnSljqktMDp>；该文件是 transitional source，不是最终 canonical。
- **Figma 空态审计**：文件仅有空白 `Page 1`；0 collection、0 variable、0 local style、0 component。`Noto Serif SC` 与 `Noto Sans SC` 所需字重均可用。
- **代码 token 审计**：`tokens.css` 35 个变量、`globals.css` 16 个变量，共 51；其中 39 个颜色、2 个阴影、3 个 motion duration、2 个 easing、3 个 z-index、1 个 radius、1 个 font stack。映射后预计 49 个 Figma variable + 2 个 Effect Style。
- **组件审计**：已有 Button/Card/Badge/Input/Dialog；Tabs、RO Card、SDF Node、Artifact Card、Review Row、Version Diff、Hermes Rail 尚无统一 `components/ui` primitive。
- **库审计**：文件未订阅库；Simple Design System 有 Button 等候选，但 token/API/所有权模型与本项目不一致，建议本地重建，只把库作为结构参考或图标来源。
- **阻塞决策**：代码真源缺少 spacing、完整 typography/radius token，且 drawer 仍写死 `z-index: 100`。Phase 1 前需批准先补齐代码 token，再镜像到 Figma，避免在 Figma 发明第二套命名。

## 2026-08-08（Figma 最终工具门禁）— 双身份通过，长期账号编辑席位待开通

- **工具加载**：重启后 `figma-temp` 与 `figma-primary` 各暴露 26 个官方工具，共 52 个；两边 `whoami` 均成功。
- **身份验证**：两个 email 不同且分别匹配预期账号前缀；临时账号 handle 为 `Ran`，长期账号 handle 为 `zju`，双 OAuth 不再串号。
- **席位验证**：临时账号拥有 Full 席位（student tier）；长期账号当前唯一 plan 为 starter tier + View 席位，没有 Team/Project 编辑席位。
- **结论**：Figma MCP 工具门禁通过，但长期账号暂不能作为可编辑 canonical owner。开始 Task 1 前需二选一：为长期账号开通 Full/Edit 席位并直接创建 canonical 文件，或按 ADR-004 先在临时 Full 账号制作、同步邀请长期账号并在席位开通后迁移。

## 2026-08-08（Figma 双账号隔离验证）— 浏览器会话复用已纠正

- **发现**：重启后两个 Figma MCP 均加载，各暴露 26 个官方工具；但首次并行 `whoami` 返回同一临时账号，说明 `figma-primary` 授权时复用了浏览器现有身份。
- **修复**：仅撤销 `figma-primary` 本地 OAuth，用户将默认浏览器切换到长期账号后重新授权；`figma-temp` 保持不变。
- **验证**：全新、只读、ephemeral Codex 客户端调用 `figma-primary.whoami`，确认邮箱属于长期账号前缀，handle 与 plan 数也和临时账号不同；未输出或记录完整邮箱、授权 URL、state 或 token。
- **当前状态**：双账号 credential 已隔离且身份正确；本对话仍持有重启前的 primary 客户端缓存，需要最后一次重启刷新 App 工具连接。

## 2026-08-08（Figma OAuth 登录完成）— enabled 与 authenticated 状态已分离验证

- **现象**：重启后 Mermaid 已正常加载，但 `figma-temp`、`figma-primary` 显示 enabled 且 auth failed，当前工具目录没有 Figma。
- **根因**：Codex 已正确读取两个原生 remote URL，但 `enabled` 只表示配置启用，不会自动完成 OAuth；官方 CLI 显示两个 server 均为 `Not logged in`。
- **修复**：分别执行官方 `codex mcp login figma-temp` 与 `codex mcp login figma-primary`，两个浏览器 OAuth 都成功完成；未读取 `.env`，未记录授权 URL、账号或 token。
- **验证**：`codex mcp list` 显示两个 Figma server 均为 `enabled / OAuth`；两个流程使用独立 OAuth 客户端和回调。Mermaid 工具 `generate_mermaid_diagram` 已在当前会话可调用。
- **剩余门禁**：当前 App 工具清单在会话启动时固定，需再重启一次；之后使用两个账号各自专属测试文件验证没有串号，再确认长期账号为 canonical owner。

## 2026-08-08（Figma 原生 MCP 修正）— 停用代理注册路径，等待一次重启认证

- **复现**：移除 profile header 并隔离 `MCP_REMOTE_CONFIG_DIR` 后，`mcp-remote` 仍在 Figma 动态客户端注册阶段返回 HTTP 403，故根因不是账号或 token 目录。
- **官方接法**：Figma 的 Codex 安装说明要求直接添加 `https://mcp.figma.com/mcp`，由 Codex 原生远程 MCP 客户端完成 OAuth。
- **修正**：Codex `config.toml` 与项目 `.mcp.json` 中的 `figma-temp`、`figma-primary` 均改为原生 `url` 配置；保留不同 server 名，并将双账号隔离列为重启后必须实测的门禁。
- **Mermaid**：使用 MCP SDK 完成真实握手，成功列出 `generate_mermaid_diagram`；包缓存已预热，等待 Codex 下次加载。
- **下一步**：重启 Codex，分别认证两个 Figma server，并用账号专属文件验证 token 不串号；如同 endpoint token 被复用，则改用两个独立 Codex profile。

## 2026-08-08（Figma OAuth 修正）— 双账号隔离从请求 header 改为独立 token 目录

- **复现**：`figma-temp` 通过 `mcp-remote` 初始化时，Figma 动态客户端注册返回 HTTP 403；错误发生在浏览器 OAuth 之前。
- **根因**：用于区分账号的自定义 `X-OpenScience-Figma-Profile` header 被带入 Figma 注册请求，Figma 拒绝该请求；因此两个 Figma MCP 在 Codex 中均未 ready。
- **修正（已由上方条目取代）**：曾移除自定义 header 并分别设置 `MCP_REMOTE_CONFIG_DIR`，但 `mcp-remote` 仍被 Figma 拒绝；最终改用 Codex 原生 remote URL。
- **Memory**：本地 memory JSONL 发现 4 个旧实体缺少 schema 字段，已无删除地补齐 `entityType`/`observations`；Memory MCP 搜索恢复，并新增产品网页设计与 Figma 所有权两条 `XGS-` 索引记忆。
- **下一步（已由上方条目更新）**：重启后走 Codex 原生 OAuth 并验证双账号；Mermaid 已完成独立握手验证。

## 2026-08-08（Codex MCP 修正）— 配置源对齐与 Figma 双账号迁移准备完成

- **根因**：重启后当前会话仍无 Figma/shadcn/Task Master 工具；审计确认 `C:/Users/Mac/.codex/config.toml` 原有 `mcp_servers=0`，项目 `.mcp.json` 不会自动加载进 Codex Desktop。
- **修正**：在 Codex `config.toml` 和项目 `.mcp.json` 对齐配置 10 个 MCP：semantic-scholar、github、mermaid、memory、context7、tavily-search、figma-temp、figma-primary、shadcn、task-master-ai；JSON/TOML 解析均通过。
- **双 Figma（已由后续条目修正）**：profile header 与 `mcp-remote` 方案均被 Figma 动态客户端注册拒绝；最终改为 Codex 原生 remote URL。临时/长期账号凭据已按用户要求写入本机 `.env`，未读取或回显现有 `.env`，不入 Git。
- **迁移决策**：新增 `docs/decisions/ADR-004-figma-account-ownership-and-migration.md`；长期账号为 canonical owner，临时账号只做过渡编辑，迁移采用目标 Team 移动/复制 + `.fig` 备份 + variables/components/prototype/Code Connect 对照验收。
- **下一步**：再次重启 Codex，实际检查 10 MCP 工具；分别完成两个 Figma 浏览器 OAuth 并核对身份；工具前置齐全后才启动 subagent-driven Task 1。

## 2026-08-08（MCP 精简）— 保留产品工作流所需的 10 个 server，等待一次重启启用

- **配置调整**：`.mcp.json` 从 11 个降至 10 个 server；移除与 `semantic-scholar` 重复的 `paper-search`，避免同类 academic MCP 重叠和上下文开销。
- **保留能力**：`figma`（设计源/MCP）、`shadcn`（组件注册表）、`task-master-ai`（任务记录）、`github`（仓库协作）、`mermaid`（图表）、`context7`（技术文档）、`tavily-search`（网络检索）、`semantic-scholar`（学术检索）、`memory`（跨会话记忆）、`fetch`（REST/API 获取）。
- **验证**：JSON 解析通过，`server_count=10`；未读取或打印任何密钥值。下一步为 Figma Professional OAuth 完成后重启 Codex，使配置一次性加载。

## 2026-08-08（工具审计）— docs-sync 与基础执行环境已验证

- **docs-sync**：`npx pnpm@9.15.0 audit:docs-sync` → `DOCS_SYNC_OK`；工作区无未提交变更后开始审计。
- **基础运行时**：Node `v24.11.0`、pnpm `9.15.0`、git `2.52.0`、rg `15.0.0`、FFmpeg `9.0`、ImageMagick 可用；`npx pnpm@9.15.0 typecheck` 与全仓 `test` 通过（apps/web 58、packages/domain 276、apps/api 50、science-worker 29 等）。
- **MCP/插件**：项目 `.mcp.json` 已登记 11 个 server，Task Master MCP server 可启动并注册 7 个 core tools；当前 Codex 会话实际工具清单未暴露 Figma、shadcn、Task Master 或 Playwright MCP，不能把配置文件当作已加载能力。
- **Figma 前置**：Figma remote MCP 配置存在，但 Professional Dev seat/OAuth 与 Codex session reload 仍是执行 Task 1 的前置条件。
- **Playwright**：浏览器缓存存在（Chromium/headless shell），`npx --no-install playwright --version` 可运行；但 root/web package 未锁定 `@playwright/test` 或 `playwright` 依赖，跨机/离线执行不保证。执行视觉任务前应将项目依赖和浏览器安装纳入 Task 1/6 门禁。
- **工具问题**：health skill 的 WSL 采集脚本因本机路径转换（`wsl: Failed to translate 'Z:\\Dirac\\scripts'`）无法运行；未修改全局配置，保留为环境风险，后续若需要完整 health audit 先修复脚本路径调用。

## 2026-08-08 — 产品级网页设计方向 A 定稿，正式 spec 已写入

- **用户确认**：采用 `Monumental Scholarly Intelligence` 作为完整产品设计基线；融合期刊策展层的编辑叙事与研究工作区效率，保留深色工作区/浅色 Public RO 双表面体系。
- **产品闭环**：明确 invite-only 候补、邮箱绑定邀请码、Dashboard 首屏、Hermes 证据与不确定性、草稿/不可变版本、RO unique ID 演化、双重引用、社区 review、Live2D/Hermes 共用状态、Ultrafast Science 策展和宽松分层许可。
- **正式 spec**：`docs/specs/2026-08-08-openscience-product-web-design.md`，定义信息架构、状态模型、媒体 provenance、响应式/无障碍、Figma 六屏交付与验收门槛；尚未修改业务代码。
- **下一步**：请用户审阅正式 spec；通过后使用 `writing-plans` 拆分 Figma foundations、统一 RO workspace、Public RO/Explore、Editorial Curator、Hermes/Live2D 和质量验收计划。

## 2026-08-08（续）— 实施计划完成，拆为六个可独立验收任务

- **计划**：`docs/plans/2026-08-08-openscience-product-web-plan.md` 已完成并与已批准 spec 对齐。
- **六任务**：Figma foundations/六屏原型；Dashboard + 统一 RO Workspace；创建/Hermes 证据/版本/任务中心；Public RO + Explore + Artifact provenance；Ultrafast Science Editorial Curator + Collection；Hermes/Live2D bridge + 视觉回归/无障碍/性能/生产验收。
- **复用策略**：复用现有 Landing、SDF editor、collab、Public RO、API/domain；Task Master 10–12 映射到计划中的 Task 1/4/6，不创建重复路线。
- **下一步**：用户选择执行方式（subagent-driven 或 inline execution）；Figma 专业版开通后先执行 Task 1。

## 2026-08-07（补七）— 一并 commit/push + Hero 重设计 v2：布局比例、视频融合、核心思想条，已上生产

- **Commit/push**：用户确认后 Task 8+9 全部改动单笔提交 `15c939e`（feat(web): design system tokens + hero loop video & entrance motion）并推送 GitHub（Basic 头方案）。
- **设计工具**：`.mcp.json` 追加 `shadcn` MCP（组件注册表查询，无需 key，重启 session 生效）；`figma` MCP 仍待用户开 Professional Dev seat + 重启 OAuth。ui-expert-mcp/Playwright/ffmpeg 已具备。职能划分定论：设计工具全部装本机（author-time），服务器只做运行时——构建产物经 cloud-sync + 远端 build + compose restart 上生产，服务器不装任何设计工具。
- **Hero 重设计 v2**（用户反馈：布局比例失调、视频与其他元素割裂、缺体现核心思想的文字元素）：
  - **融合**：符号容器放大至 `h-[min(118vh,1360px)]`、`right-[-16%]`，mask 羽化加深（black 45%→74%），视频加 `contrast-[1.08] saturate-[1.06]` 压掉近黑底色（消除 screen 混合下的方形边界），符号背后加 accent 径向光晕（rgba(42,109,255,0.18) blur-2xl）把符号"渗"进背景。
  - **核心思想条**：hero 底部新增三柱条——`01 结构化`（SDF 可查询结构）/`02 可验证`（沙箱重跑）/`03 自进化`（Hermes 评审演化），mono 序号 + display 标题 + muted 描述，顶部分隔细线；i18n 新 key `hero.pillar{1,2,3}{Title,Desc}`（zh/en）。
  - **布局比例**：容器改两段式 flex-col——内容区 `flex-1 justify-center` 垂直居中，三柱条钉底。
  - **坑**：三柱条初版 `absolute bottom-0` 被 LatestResearch 的 `-mt-24/-mt-28` 叠印遮盖（elementFromPoint 实测命中下一 section），改 in-flow + 容器 `pb-32/lg:pb-36` 让出叠印区。
- **验证**：build/typecheck 绿；本地 3100 双视口截图迭代三轮（v1 方框边残留 → v2 CTA 碰撞 → v3 成立）；生产部署后实测：桌面 1440×900 与移动 390×844 截图符合预期，video 播放中（ro-loop.webm，t=5s）。
- **下一步**：等用户确认 commit 本轮（Hero v2 + i18n + index）；Task 10 Figma 待 seat/OAuth；Task 11 全站收口。

## 2026-08-07（补六）— Task 9 动效层完成：Hero 循环视频 + CSS 进入动效，已上生产

- **视频管线**：用户用 Gemini 按分镜 prompt 生成 `docs/user_ideas/generated_figures/video/video1.mp4`（1280×720/24fps/10s，figD1 六面板 Hermes 枢纽版）。本机 scoop 装 ffmpeg 9.0（一次性素材加工，非项目依赖）处理：首尾 1s xfade 叠化消循环接缝（原片末帧仍在亮态、直循有跳切）→ 中央 720² 裁切（顺带去掉右下角 Gemini ✦ 水印）→ 三产物入 `apps/web/public/hero/`：`ro-loop.webm`（VP9 crf34，715KB）/`ro-loop.mp4`（H.264 crf23 faststart 兜底，1.0MB）/`ro-loop-poster.webp`（首帧，31KB）。
- **Hero 接入**：桌面 `<video autoplay muted loop playsInline poster>`（webm 优先）+ `motion-reduce` 下隐藏视频改渲染 poster Image；移动端静态 poster（省流量）。video 继承 mix-blend-screen + 径向 mask，旧 `ro-symbol.webp` 不再被引用（Task 12 待清理）。
- **进入动效（零依赖路线，弃 framer-motion）**：globals.css 新增 `landing-reveal`（fade+translateY 24px，0.7s var(--ease-entrance)）与 `landing-symbol-in`（纯淡入 1.2s），全部 `prefers-reduced-motion: no-preference` 门控；Hero 徽章/标题/副文/CTA inline animationDelay 60–300ms stagger。滚动进入用自写 `in-view.tsx`（IntersectionObserver，-12% rootMargin，一次即停），CSS 侧 `html.js` 门控（layout 一行 inline script 加 js 类）——无 JS 时内容始终可见，SEO/降级安全。弃 framer-motion 理由：纯进入动画 CSS 等价且 SSR/reduced-motion 零风险，首包仅 +1kB（108→109kB，门 <30kB）。
- **验证**：web 58/58、typecheck、build、全仓 lint+docs-sync 全绿；本地 1440×900/390×844 截图；reduced-motion 仿真实测视频隐藏暂停、poster 显示；生产部署后实测 video 播放中、`landing-reveal` 激活、4 个 landing-inview 滚动触发正常。
- **部署坑**：云上 `pnpm install` 直连 registry 网络失败（管道 tail 掩盖退出码，build 才报 @radix-ui/react-dialog 缺失）——云上联网命令必须 `with-proxy` 且不吞退出码；install 后 build 7.8s 过（cpu-features 可选原生依赖 gyp 失败无害）。
- **下一步**：等用户确认后一并 commit（Task 8 + 9，用户指定）；Task 10 Figma 待用户开 seat + 重启 session OAuth。

## 2026-08-07（补五）— Push 完成 + Task 8 设计系统固化（token 补全 + 原语双表面）

- **Push**：`c82759f..baefcc4` 已推 GitHub。坑：`.env` 两个 token 走 `Authorization: Bearer` 均被拒（extraHeader Bearer 对 PAT 无效），改 `x-access-token:<tok>` base64 的 Basic 头成功；值需 tr 掉引号。
- **Task 8 完成**（计划 docs/plans/2026-08-07-web-quality-pipeline-plan.md）：
  - `tokens.css` 补结构 token：`--state-danger:#B91C1C`（初取 #DC2626 实测 hero-text 白字对比 4.32 不达标，换 #B91C1C 达 5.8）、`--motion-fast/breathe/scan`（spec §2.2 上限值）、`--radius-card`、`--shadow-card/overlay`、`--ease-standard/entrance`（Task 9 framer-motion 同值镜像预留）、`--z-header/overlay/modal`。
  - **双表面机制**：原语默认纸白；祖先挂 `.surface-dark` 类整体切深色（`[.surface-dark_&]:` 任意变体，server-safe 无 JS）；Dialog 因 Portal 断链用 `surface="dark"` prop。规格落 spec §3.1。
  - **修契约违约**：button/badge 的 `destructive` 原用 accent-diff（违反"暖橙仅表 diff"），改 state-danger。
  - 新增原语 `input.tsx`、`dialog.tsx`（@radix-ui/react-dialog 入 web deps）。
  - 测试：ui-components 加双表面/state-danger 断言；tokens-contrast 门禁加 hero-text/state-danger 配对、@theme 映射检查改为仅约束颜色值变量（结构 token 不进 --color-* 命名空间）。web 58/58、typecheck、build 全绿；产物 CSS 实测 `.surface-dark` 后代选择器、`rounded-card`/`shadow-card`/`ease-standard`/`z-(--z-modal)`/`duration-(--motion-fast)` 均生成。
- **注意**：原语尚未被任何页面引用（grep 无业务引用）， landing 视觉零变化，无需部署；Task 11 全站收口时统一接入。
- **下一步**：Task 9 动效层（framer-motion + Hero 循环视觉，Gemini 图生视频 prompt 待交付用户）。

## 2026-08-07（补四）— Landing 全部改动 commit + Web 品质管线立项（Task 8–12）

- **Commit**：用户批准后拆三笔——`481b5c4` feat(web) landing 完整版（生成资产/EvolutionPanel/HermesBand/TrustBand/符号 stage 化/i18n/测试，19 文件 +837）；`182181f` chore（eslint 覆盖 apps/*/scripts、prod web `npm run start`）；docs 批（本日志 + project_index 补登记 EvolutionPanel/HermesBand/hero 资产/新计划 + 计划文档 + tasks.json + 用户素材 figA/figB/v2 交接解包件）。未 push。
- **立项**：用户拍板做产品级全站品质（不只主页）。产出 `docs/plans/2026-08-07-web-quality-pipeline-plan.md`——Task 8 设计系统固化（token 补全 + shadcn 原语双表面）→ 9 动效层（framer-motion + Hero 循环视觉，Gemini 图生视频优先）→ 10 Figma 设计上游 + 远程 MCP + Code Connect → 11 全站一致性（三套视觉 × 公开 RO/工作台/About/auth/Explore）→ 12 视觉回归门禁（shots.mjs → CI）+ 闲置资产清理。tasks.json 已追加 Task 8–12（parse_prd append 实际写入但回包超时，依赖手工对齐为 8←7、9←8、10←8、11←[9,10]、12←11）。
- **Figma 决策**：用户认为产品级需要 Figma，同意。核实：远程 MCP 全计划可用但免费档仅 6 calls/月不可用，实际需 Professional Dev seat（$12/月，200 calls/day）；Code Connect 是生产级输出前置（否则生成代码绕过设计系统）。Figma 侧待用户操作：开通 seat、OAuth 授权。
- **对账外部推荐清单**：跳过 Vercel/Supabase/Webflow/Framer（与自有 ECS+Docker+Postgres 架构冲突）；Playwright/GitHub MCP、Next/Tailwind/shadcn 底座、Lucide 均已具备；真缺口 = 动效层、Figma 环节、视觉回归门禁。
- **下一步**：Task 8 开工；等用户 Figma seat/OAuth（Task 10）；api 容器 unhealthy 仍待查。

## 2026-08-07（补三）— Landing 全区块补齐：四阶段演化面板 + Hermes 区块（P2 页面部分）

- **起因**：用户指出首页仍不达预期、缺核心思想元素。复盘根因：P0/P1 计划 11 个 Task 只覆盖 Header+Hero+#latest 原型，承载概念的「四阶段演化面板」「Hermes 区块」划在 P2 且一直未排期——把原型当成了成品页。本轮按 v2 定稿 §4 补齐整页（GET /explore 后端端点仍待 P2 另排）。
- **新增**：`EvolutionPanel.tsx`（client）——四阶段 stepper（创建→Hermes 解析→协作 Diff→合并发布），同一 SVG 符号随阶段 morph（`EvolvingRoSymbol` 新增 `stage` prop：create=环 0.35 暗+problem 面亮+隐轨迹；parse=主轨迹；diff=分支/merge/橙点；publish/默认=全亮），组 opacity CSS 600ms 过渡，挂载后 2.6s 步进自动推进一轮即停（v2：禁循环禁 scroll-jacking），点击即接管；移动端横向 snap 滑动卡片。`HermesBand.tsx`——上下文理解/证据检查/分级审批三卡（v2 §4.5 的 Hermes 面，非"万能 AI"罗列）。
- **Hero 再升级**：符号放大到 h=108vh（max 1200px）右 -12% 越界；新增 v0.1/v0.2/v0.3 版本标签（font-mono 10px、hero-muted/40，沿符号左弧排布，provenance 暗示，aria-hidden）；标题 xl:text-8xl；SiteHeader 容器 max-w-7xl→max-w-none（超宽屏导航贴边）。
- **LatestResearch 去浮盒**：删掉 32px 圆角大边框容器，改平铺分隔线 band。
- **坑**：EvolutionPanel 桌面 grid 未显式 `grid-cols-1` 时，auto 轨道取 max-content 导致移动端 stepper 把 body 撑出横向滚动条（scrollWidth 952）；改 `grid-cols-1`（minmax(0,1fr)）+ 子项 min-w-0 修复，实测 scrollWidth 375 ≤ 390。
- **验证**：web 56/56（符号 stage 新增 3 断言、landing 结构锁 evolution/hermes 模块）、typecheck、build（首包 108 kB）、全仓 lint + docs-sync 全绿；本地 1440×900/390×844 与生产整页截图一致。生产已部署。未 commit。
- **下一步**：用户验收整页 → commit；GET /explore 真实 feed（P2 后端）；api 容器 unhealthy 排查仍未做。

## 2026-08-07（补二）— Hero 质感层上线：Gemini 资产 screen 混合合成

- **资产**：用户用 Gemini Plus 按项目 prompt 自生成 `figA.png`（玻璃楔形环符号，1254² 纯黑底，自带橙点 diff/轨道环/历史轮廓）与 `figB.png`（氛围底，1672×941）；入库 `apps/web/public/hero/ro-symbol.{png,webp}`（webp 104KB）与 `hero-ambient.{png,webp}`（webp 8KB），PNG 为源文件。
- **合成方案**：figB 全幅 cover 氛围底 → 左侧文案可读性渐变 veil → figA `mix-blend-screen` 消黑底 + 径向 mask 羽化（black 60%→transparent 88%，首版 56%/77% 会切出直线边已修）+ 12s 呼吸动效（globals.css 追加 `hero-symbol-breathe`，reduced-motion 不加载）；移动端同一资产居中。SVG 版 `evolving-ro-symbol.tsx` 保留（后续四阶段面板复用），Hero 不再引用。
- **验证**：web 53/53、typecheck、build 全绿；本地 1440×900/390×844 截图确认；云上 build + restart web 后生产桌面/移动截图确认一致（过程中一次 public:000 为云上 DNS 解析抖动，重试 200）。
- **部署**：cloud-sync → 云上 `next build` → restart web；生产已上线玻璃环版本。未 commit。

## 2026-08-07（补）— Landing Hero 结构层重做上线：环形楔形几何 + 去假数据 + 全暗场

- **背景**：用户对已上线首页美感不达标（对照 Moonshot 与 v2 定稿差距大）。实测调研：moonshot.cn 营销站 = Rive/预渲染视频 + 大图 + 真实 DOM（非 Three.js）；Linear/Terax 类 = 单一 WebGL shader 面（OGL 级小库）。结论：质感靠预制资产，语义靠真实 DOM/SVG。
- **路线定稿（用户确认）**：分层混合——SVG 精确环形几何（结构层）+ 用户用 Gemini Plus 按项目 prompt 自生成玻璃质感贴图（质感层，待供图）+ SVG 蓝色轨迹/橙点 diff（语义层）；GLSL 氛围背景可选后置。prompt 已交付用户（主符号 1:1 纯黑底 / 氛围 16:9 / interface 变体）。
- **实现**：`evolving-ro-symbol.tsx` 从手摆四边形重写为计算几何——6 个 52° 环扇楔形（8° 缺口）、内外半径 330/158 开放中心、楔形顺序=研究周期顺时针（problem→reproducibility）；轨迹改为主轨迹穿中心 + 右下缺口处分支 merge 成泪滴环、橙点 diff 落在楔形缺口（60°, r≈244）；辉光降不透明度（0.78→0.55 / 0.38→0.22）+ 玻璃填充加 accent 淡蓝渐变。`Hero.tsx` 弃用 bitmap 全幅背景（`generate-landing-hero.mjs`/`public/hero/landing-hero.png` 自此闲置待清理，knip 会报），符号改为真实 DOM 右侧越界排布（h=92vh）；标题 i18n 加显式 `\n` 锁定两行（whitespace-pre-line），修复"化。"孤行；CTA 主按钮加蓝色光晕、次按钮毛玻璃。`LatestResearch` 删除全部假数据（latest.cards.* 文案同步删除）改纯 skeleton+空态。`TrustBand` 从纸白改深色延续（hero-surface 卡片）。
- **验证**：符号测试 8/8（轨迹期望值更新 + 新增环形几何断言 A330/A158 ≥18）；web 全套 53/53、typecheck、build（首包 101 kB）、全仓 lint + docs-sync 全绿；本地/生产 Playwright 截图（1440×900、390×844）确认构图与移动端顺序。
- **部署**：cloud-sync → 云上 `next build` → restart web 容器；隧道实测存活（经隧道 registry 401=可达）；生产 https://openscience.428312321.xyz/ 200 已上线新版。未 commit。
- **注意**：`openscience-prod-api-1` 容器显示 unhealthy（已 3 天），本轮未处理，待查。
- **下一步**：等用户 Gemini 生成质感层资产 → 合成（screen 混合/裁切）→ 三尺寸截图验收 → token 冻结（Task 7.11）；P2 接 GET /explore 真实 feed；查 api 容器 unhealthy。

## 2026-08-07 — Landing 首页视觉重做、入口修复与生产部署

- **状态**：针对生产页“视觉未达规划、子入口失效”的问题完成重做并部署到生产，尚未 commit / push。
- **实现**：Hero 改为全幅 bitmap 主视觉背景（`apps/web/public/hero/landing-hero.png`，由 `apps/web/scripts/generate-landing-hero.mjs` 本地生成，不直接使用原型图）；`#latest` 改成真实深色内容带 section；新增 `#trust` 信任区；Header 的“探索/关于”现在落到真实 section；新增 landing 结构回归测试锁定 `hero/latest/trust` 三模块与锚点。
- **工具取舍**：GitHub 社区方向调研后试装 `motion`，build 实测首页首包 106 kB → 156 kB，收益不抵成本，已撤回依赖并改用 CSS transition；未引入 Three.js / Live2D / pixi。
- **部署修复**：首次重建 web 容器后生产首页 502；定位为 `docker-compose.prod.yml` 中 web command 使用 `npx pnpm@9.15.0 ...`，新容器内需联网/确认 pnpm，Next 未真正启动。已改为 `npm run start`，使用 `apps/web` 本地 `next` binary 启动，重建后容器日志显示 Next ready。
- **验证**：focused landing test 2/2、web 全套 52/52、web typecheck、web build 通过；build 后首页首包 6.82 kB / First Load JS 106 kB；全仓 lint/docs 门禁通过；云上全量 build 通过；生产 `https://openscience.428312321.xyz/` 返回 200，SSR 含 `hero/latest/trust` 模块与 `landing-hero` 资产；`/auth/me` 仍返回 401；Playwright 生产桌面 1440×900 与移动 390×844 截图确认无横向溢出，`#latest` 与 `#trust` 均存在且 `#latest` 首屏可见。
- **下一步**：本轮上线版仍未达到最终审美标准；继续专门做视觉质量迭代（构图、字体节奏、真实内容密度、动效/图像资产），用户确认后再 commit/push。

## 2026-08-07 — 前端 P0/P1 Landing 页面组装与部署准备

- **状态**：Landing 首页已部署到生产域名；两版 `EvolvingRoSymbol` 可由 `?symbol=a|b` 切换；生产拓扑已补 Web 服务与 nginx 分流；本地代码作为本次收口 commit 入库，尚未 push。
- **实现**：`apps/web/app/page.tsx` 替换占位；新增 `Hero.tsx`、`LatestResearch.tsx` 与 Playwright 截图脚本；`app/layout.tsx` 移除全局 LocaleSwitcher，避免 Header 内控件重复；`infra/compose/docker-compose.prod.yml` 增加 `web` 服务（127.0.0.1:3000），`infra/nginx/openscience.conf` 根路径转 Web、API/auth/admin 等路径转 Fastify。
- **验证**：web typecheck、web tests 50/50、web build、全仓 lint、docs-sync、docs:lint 通过；本地 `next start -p 3002` 返回 200；Playwright 8 张截图已生成于 `apps/web/test/visual/out/`（gitignored），人工检查桌面与移动无明显重叠/空白，移动端 latest 提示露出；云上 install + 全量 build 通过，`openscience-prod-web-1` Up，服务器与 Playwright 均验证 `https://openscience.428312321.xyz/` 返回 200 且包含新首页内容，`/auth/me` 仍经 nginx 分流到 API 返回 401。
- **下一步**：提交当前落地页与部署配置改动；如需对外同步，执行 git push。

## 2026-08-06（补十七）— 前端 P0/P1 Task 7.7 EvolvingRoSymbol

- **状态**：Task 7.7 已实现并完成本地验证，未创建 commit。
- **实现**：新增 server-safe `apps/web/components/landing/evolving-ro-symbol.tsx`，提供 `sculptural`/`interface` 两种变体；六个 SDF facet、三层蓝色轮廓辉光、历史轮廓、中心轨迹/分支/合流与单个橙色 diff node；`prefers-reduced-motion` 下不输出动画 class/style。
- **测试**：新增 `apps/web/test/evolving-ro-symbol.test.tsx`；Vitest 配置扩展为发现 `.test.tsx`。Review fix 后补充轨迹拓扑与 SVG 层级断言；focused 7/7、web 全套 50/50、web typecheck/build 全部通过。
- **下一步**：进入 Task 7.8 Hero assembly；用户确认后再按既定节奏提交。

## 2026-08-06（补十六）— 前端 P0/P1 Task 7.6 Landing SiteHeader

- **状态**：Task 7.6 已实现并完成 fix round 1，task-master 已置 `done`；reviewer scoped re-review clean，未创建 commit。
- **实现**：新增 `apps/web/components/landing/SiteHeader.tsx`，包含语义 header/nav、landing.nav.* 文案、四个指定 href、logo + OpenScience wordmark、现有 LocaleSwitcher、滚动超过 24px 后的 token 化深色模糊背景、passive listener cleanup 与可见焦点状态；窄屏下 header/nav 分行并允许导航换行，避免英文横向溢出。
- **集成风险**：按 brief 保留 `app/layout.tsx` 不变，因此全局 LocaleSwitcher 与 SiteHeader 内 LocaleSwitcher 会同时存在，待后续 landing page assembly 处理。
- **验证**：web typecheck、web build、web 全套测试 43/43、`git diff --check` 全部通过；详细报告见 `.superpowers/sdd/2026-08-06-frontend-p0-p1-plan/task-6-report.md`。
- **下一步**：用户确认后提交 `feat(web): landing site header`，再进入 Task 7.7 EvolvingRoSymbol。

## 2026-08-06（补十五）— 前端 P0/P1 Task 7.5 审查收口

- **状态**：Task 7.5 落地页 `landing.*` i18n 命名空间已实现，task-master 7.5 已置 `done`；reviewer clean，当前等待用户确认 commit。
- **实现**：`apps/web/messages/zh.json` 与 `apps/web/messages/en.json` 新增对称 11 键，覆盖 nav、hero、Hermes 状态与 latest 空态；未改组件或依赖。
- **验证**：focused i18n 2/2、web 全套 43/43、JSON 语义检查、`git diff --check` 通过；reviewer 独立确认两份消息叶键集合均为 201 且无无关改动。
- **下一步**：用户确认后提交 `feat(web): landing i18n messages`，再进入 Task 7.6 SiteHeader。

## 2026-08-06（补十四）— 前端 P0/P1 Task 7.4 审查收口

- **状态**：Task 7.4 `shadcn/ui` 底座已实现并提交，任务 reviewer 双审通过；task-master 7.4 已置 `done`。
- **实现**：新增 `components.json`、`lib/utils.ts`、`button`/`card`/`badge`/`skeleton` 四组件、`ui-components.test.ts`；`CardTitle` ref 类型与 `<h3>` 对齐，Vitest 增加 `@/` alias。
- **验证**：web focused render 1/1、web 全套 43/43、web typecheck/build、全仓 lint（含 workspace/docs-sync）、`audit:docs-sync`、`docs:lint`（146 文件 0 issues）全部通过。为清除基线遗留的 MD012，修复 handoff 工作副本末尾多余空行。
- **审查**：初审 2 个 Important 已在 fix round 1 修复，scoped re-review 无新 Critical/Important；提交为 `feat(web): add shadcn ui base components`。

## 2026-08-06（补十三）— Task 7.4 Round 1 review findings fixed

- **修复**：`CardTitle` ref 类型改为 `HTMLHeadingElement`；新增 `apps/web/test/ui-components.test.ts`，用 `react-dom/server` 实际渲染并断言 Button/Card/Badge/Skeleton；Vitest 增加既有 `@/` alias 解析，Skeleton 补显式 React runtime import。
- **验证**：web `typecheck` 通过；web `test` 9 files / 43 tests 通过；web `build` 通过；`audit:docs-sync` = `DOCS_SYNC_OK`；`git diff --check` 通过。
- **报告**：fix wave 已追加到 `.superpowers/sdd/2026-08-06-frontend-p0-p1-plan/task-4-report.md`；无 commit。

## 2026-08-06（补十二）— 前端 P0/P1 Task 7.4 shadcn/ui 底座完成

- **实现**：`apps/web` 新增 shadcn/ui `new-york` 配置、`cn` 工具，以及 `button`、`card`、`badge`、`skeleton` 四个基础组件；新增五个 runtime dependencies，未修改现有页面行为或 CSS。
- **Token 约束**：组件默认表面使用现有 `paper-bg`/`canvas-bg`/`ink`/`hero-*`/`accent-*`/`border-subtle` Tailwind v4 token；未引入 slate/zinc 默认色或 preflight。
- **验证**：`npx pnpm@9.15.0 typecheck`、`test`、`build` 全部通过；web 单测 42/42；`git diff --check` 通过。构建仅有既存 next-intl cache warnings。
- **测试说明**：未新增 storyless render assertion，因为当前 `apps/web/vitest.config.ts` 是 Node 环境且未提供 DOM renderer；未引入新测试框架。详细报告：`.superpowers/sdd/2026-08-06-frontend-p0-p1-plan/task-4-report.md`。
- **下一步**：controller review 未提交 diff。

## 2026-08-06（补十一）— 前端 P0/P1 开工：7.1–7.3 完成（SDD 模式），交接 GPT 续作

- **执行模式**：subagent-driven-development——每 Task 派 implementer + reviewer 双审，审查干净后问用户 commit；台账 `.superpowers/sdd/2026-08-06-frontend-p0-p1-plan/progress.md`。
- **7.1 Tailwind v4**（`2bacb65`）：postcss 接入；关键决策=走 theme+utilities 降级导入（无 preflight），因协作/公开页多处裸 h3/h4/ul 依赖 UA 默认样式，审查抽查成立。
- **7.2 token + WCAG 门禁**（`fd46359`）：tokens.css 11 变量 + @theme 映射；对比度测试从 tokens.css 正则取色（防漂移）；`--accent-primary-strong` #256BFF→#2A6DFF（4.47→4.57 最小调整，审查复算证实）并同步 spec §3。
- **7.3 字体 + LocaleSwitcher**（`61d19a4`）：Noto Serif SC 600/900 + swap + `--font-display`；关键决策=`preload:false`（next/font 对 google CJK 只登记 latin 子集，preload 需 subsets:['latin'] 会丢 CJK 字形；保留 202 条 unicode-range 分片按需加载，首屏 preload 0KB）；LocaleSwitcher token 化样式（逻辑不动）。
- **task-master**：任务 7 登记（11 子任务，与 plan 一一对应），7.1–7.3 done。
- **遗留 minor（台账记录，终审复核）**：惰性 utility 4 条；LocaleSwitcher 浅色页面对比度（P3 产品壳解决）；tokens 正则健壮性。
- **交接**：token 预算原因，7.4–7.11 移交 GPT 执行，交接文档 `docs/handoff/2026-08-06-frontend-p0-p1-sdd-handoff.md`。

## 2026-08-06（补十）— 前端设计方向 v2 定稿（用户 × GPT × Kimi 三方）

- **输入**：GPT handoff v2（`docs/user_ideas/OpenScience-Kimi-Handoff-v2.zip`，含 HANDOFF.md + hero 参考图）与 `docs/user_ideas/主页原型图.png`（1672×941 art-direction 稿）。
- **Kimi 代码库校验两发现**：①SDF 真实六节点类型为 problem/insight/method/results/limitations/reproducibility（`infra/schema.prisma` SdfNodeType），与 GPT 猜测的内容六类不符 → 六面语义改映射真实节点；②API 无公开 RO 列表端点 → 定稿新增 `GET /explore` 轻量公共端点（走 api-contract）。
- **调研**：AI poster 质感纯前端复现可行（SVG 分层辉光 3–4 层 feGaussianBlur/feMerge、mix-blend-mode 叠光、feTurbulence 噪点；动效只调 opacity/transform）；copy-in 生态（Magic UI/Aceternity，与 shadcn 同模式）仅用于氛围、不用于核心符号。
- **grill-me 逐分支定稿 D1–D9**：D1 定位 Monumental Scholarly Intelligence；D2 符号=Evolving RO（SDF 六节点语义+纯 SVG+两版变体）；D3 首页 IA（hero 文案/双 CTA/feed 嵌首页+新端点/四阶段面板禁 scroll-jacking）；D4 三套视觉+token 按 GPT（蓝主色 #4C8DFF、暖橙仅 diff、WCAG 验证后冻结）；D5 期刊元素=符号通用+内容层露出；D6 Hermes Live2D 一步到位+五条缓释（iframe 常驻单实例/懒加载/首曝 Dashboard/reduced-motion 回退/单 PIXI）；D7 思源宋子集自托管+系统正文；D8 分期 P0–P4（Live2D 从 GPT P4 提前到 P3）；D9 沿用 GPT 验收标准（3 秒识符号/LCP≤2.5s/WCAG AA 等）。v1 的 10 个开放问题全部结案。
- **落档**：`docs/proposals/2026-08-06-frontend-design-direction-v1.md` 头部状态改 v2 定稿，文末新增「v2 终稿决策层」（效力高于 v1.x 各节）+ 讨论纪要 v2 条目。
- **执行方案**：正式 spec `docs/specs/2026-08-06-frontend-visual-system-design.md`（定稿版，无历史脉络）+ P0/P1 实施计划 `docs/plans/2026-08-06-frontend-p0-p1-plan.md`（11 Task：Tailwind v4→token+WCAG 门禁→字体→shadcn→i18n→Header→EvolvingRoSymbol 两变体→Hero→#latest→Playwright 三尺寸截图→用户验收门；P2+ 待 P1 验收后另出计划）。
- **下一步**：用户审 spec/plan → 选执行方式（subagent-driven 或 inline）→ 开工 P0 Task 1。

## 2026-08-06（补九）— 前端地基三修：next-intl 接通 + 公开页文案 i18n + 静态资产

- **next-intl 接通**（修「14 文件 useTranslations 无 Provider」P0 坑）：采用 v4 无 locale 路由方案——`next.config.mjs` 包 `createNextIntlPlugin`；新增 `apps/web/i18n/request.ts`（getRequestConfig，cookie `NEXT_LOCALE` → Accept-Language → 默认 zh）+ `i18n/locale.ts`（client 安全的常量/解析器，避免 server-only 依赖进 client bundle）；`app/layout.tsx` 改 async server component，`getLocale`/`getMessages` + `NextIntlClientProvider` 包 children，`<html lang>` 按 locale 输出；新增 `components/LocaleSwitcher.tsx`（写 cookie + router.refresh）。
- **公开页文案 i18n**：`messages/zh.json`/`en.json` 新增 `public` 命名空间（错误态/复制按钮/概览页各节/AI 审核/标签导航，约 40 键，zh/en 对称）；`components/public/PublicVersionPage.tsx`、`TabNavigation.tsx` 全部硬编码文案改 `useTranslations('public')`（原英文 TAB_LABELS 一并收编为 `public.tab.*`）。
- **静态资产与 metadata**：新建 `apps/web/public/`——手写极简 SVG：`favicon.svg`（脉冲线深色圆角方块）、`logo.svg`（脉冲标 + 字标）、`og-image.svg`（1200×630 占位）；`public/hermes/README.md` 记录 Hermes Live2D（wanko 模型）待从 Scholar's Tea 迁移且须保留出处。`layout.tsx` metadata 换真实 title/description（中文为主）+ favicon/OG 引用 + `metadataBase`。
- **验证**：vitest 34/34（含 i18n zh/en 键对称门禁）；`next build` 通过；`next start` 冒烟：默认 zh-CN、Accept-Language en 生效、公开页 SSR 输出 i18n 文案（研究对象标签）无抛错。
- **遗留**：LocaleSwitcher 无样式（globals.css 未动，P2A 统一处理）；`/research/[publicId]` 页面本体仍是占位。

## 2026-08-06（补八）— 前端设计方向 v1 讨论稿产出（进入网页设计规划阶段）

- **产出**：`docs/proposals/2026-08-06-frontend-design-direction-v1.md`（三方讨论稿 v1），含审美定位（学术工程感）、色彩/字体/符号、IA 页面地图、三套视觉具体化、动效 L0–L3 分级、Hermes Live2D 陪伴形象、技术底座决策、10 个开放问题、P2A–P2E 分期草案。
- **调研输入**：竞品分析 docx（pandoc 提取，34 竞品全为战略/IA 层启发无视觉观察）、moonshot.cn 交互风格、微信文章（scroll-world + img2threejs 两个 agent skill 项目）、nyblnet/bento（明文 JSON + morph 转场 + Fraunces/Instrument Sans 字体）、SPJ 期刊模板、GitHub 设计 skill 生态（结论：引 Tailwind v4+shadcn/ui 底座 + Playwright MCP 截图闭环 + vercel-labs 两 skill，否 Figma/21st.dev/v0 类）。
- **摸底发现（P0 地基坑）**：i18n provider 疑似未接线（14 文件 useTranslations 无 NextIntlClientProvider，运行时即抛错）；公开页文案硬编码中文违反自家 frontend-design skill 第 11 条；无 public/ 静态资产；1397 行单文件全局 CSS。
- **下一步**：用户与 GPT 讨论 v1 → 回稿迭代 v2 → 定稿后转 `docs/specs/` 正式 spec + 拆 plan。

## 2026-08-06（补七）— 测试链路修通：沙箱安全基线 19/19 + api 集成 104/104 云上全绿

- **测试脚本修复**：science-worker `test:integration` 原为匹配不到测试的 jest 残骸（pnpm -r 遇错即停，api 套件从未被执行）；拆分后 Docker 用例走 test:integration、纯单测本地 29/29 首绿。
- **沙箱安全基线 5 败修复**（P1E-8 门槛首跑）：pickle/动态导入/getattr 绕过 3 例根因=静态 AST 黑名单未接入执行链——补双层纵深（pollOnce 静态拒收 + 容器内运行时前言中和 os.system/pickle 族；实证 eval/exec/compile 不能中和，CPython import 机制依赖）；内存测试 payload 错（np.zeros 惰性零页不占 RSS，补 .fill(1.0) 真触发 OOM）；设备节点测试 `os.stat.S_IFBLK` 笔误改 `stat.S_IFBLK`。
- **api 集成 3 败修复**：sandbox-jobs 测试字段名错（kind→type + 补 ownerId，该文件从未真正运行过）；research 断言过期（P1D-9 改 {research:{version}} 包装，测试没跟上）；配额 2 败根因=其他测试文件 afterAll `quotaPolicy.deleteMany()` 全表清理误杀迁移 20 seed 行（实现无错，测试改自建夹具+精确回收）。
- **最终证据**：云上 `sandbox-(security|escape)` 19/19 过；api 集成 21 文件 104/104 过（无 skipped）。
- **结构性隐患（已记 Memory）**：集成测试全表 cleanup 惯例会误杀任何 seed 依赖；P1D-9 未跑 research 测试说明集成套件缺 CI 强制门禁（需 Docker 环境）。

## 2026-08-06（补六）— 卫生审计清零：syncpack 版本对齐 + knip 杂项修复

- **audit:deps（syncpack）**：science-worker 的 @types/node/typescript 版本与全仓对齐；14 个包 vitest `2` → `^2` 统一（syncpack fix），`audit:deps` 转绿。
- **audit:knip 清零**（除豁免项）：ioredis 补进 apps/api devDependencies（原靠 hoist）；`@types/diff`（diff@9 自带类型）与 `fake-indexeddb`（无引用）移除；agent-worker 测试跨包深引用改为 `@openscience/domain/test-helpers` 子路径导出（domain package.json 新增 exports 映射，已确认全仓无其他深引用）；5 个 unused exports/types 分诊——`WARNING_CATEGORIES`/`getUsageByPeriod`/`UsagePeriodQuery` 为计划内预留（补了 usage-ledger period 过滤测试 + fake 保真度），`PolicyViolation`/`HighRiskState` 去 export。
- **audit:dep（depcruise）**：6 个 orphan 均为占位/待接线文件（search/ui/sandbox-controller/sandbox-cache 等），warn 级设计内。
- **audit:dup（jscpd）**：7.79%（178 clones），信息级无门禁，不在本轮范围。
- knip 剩余 3 个 unused files = 待接线的沙箱前端组件（ScriptModifier/VisualizationResult/sandbox-cache），留给前端设计阶段接线，属预期。

## 2026-08-06（补五）— 技术债清零：schema 模型补齐、产物落库闭环、完成事件接通知

### 修复内容
- **schema.prisma 漂移**：补 `model SandboxJob`/`SandboxArtifact`/`enum SandboxJobStatus`（严格对齐迁移 20/21 DDL；memberships 复合 FK 因列序与 prisma 唯一键相反，仅 DB 侧强制不建模）；User/Workspace 加反向关系。仅 `prisma generate`，不走 migrate dev/db push。`sandbox-jobs.integration.test.ts` 的 `prisma.sandboxJob` 自此名正言顺。
- **产物落库闭环（P1E-6 缺口）**：P1E-4 设计文档只定义了 SandboxArtifact 数据模型（§4.2），未规定产出机制。采用最简约定：脚本写产物到容器 `/output`（tmpfs 挂载 + `OUTPUT_DIR` env），执行完 `getArchive` 拉 tar → 自研最小 ustar 解包（`artifact-collector.ts`，无新依赖）→ `createSandboxArtifacts` 落库（先于状态写回）。收集失败返回空不炸作业。
- **完成事件接通知（P1C-9）**：`onSandboxJobCompleted` 同事务补 `notification.create`（type `sandbox_job.completed`，payload 带 status 区分成功/失败/超时，对齐 §16 点分风格）。
- **auth fake 补 level**：`fakes.ts` user.create 默认 `level: 'free'`，CurrentUser.level 单测有真实值。
- **单测新增 15 例**（job-runner 8 + artifact-collector 7，全 mock 接缝，不依赖 Docker）。

## 2026-08-06（补四）— 迁移 19/20/21 云上 deploy 完成（生产库已验证）

- 容器内 `migrate deploy` 成功：迁移 20（sandbox_jobs）+ 21（sandbox_job_context + users.level）应用完成，并顺带补上此前漏 deploy 的 19（author_affiliation）——生产库此前实际停在 18。
- 生产库直查验证：`sandbox_jobs.context` / `sandbox_artifacts` / `users.level` 列均在，`user_level` 配额 9 行（free/pro/team × 3 资源）落库。
- 至此迁移 1–21 全部云上生效。**遗留**：生产 compose 仍无 science-worker 常驻服务（用户选择本次只上迁移），沙箱作业执行链要真正跑起来需后续走 infra-runbook 流程加服务。

## 2026-08-06（补三）— science-worker 执行链接线 + updateSandboxJobStatus 合并写

### 排查结论
- **执行链未接线**：`apps/science-worker/src/index.ts` 此前只有 `export const placeholder = true`，POST /sandbox-jobs 落库后无任何消费者（全仓 grep 证实 `updateSandboxJobStatus`/`onSandboxJobCompleted` 仅被 domain 自身与测试引用）。设计文档数据流图（创建任务 → SandboxController → 状态/记账/审计）从未落地。
- **已修复**：science-worker 新增注入式 `pollOnce`（接缝参照 agent-worker createPollOnce）：`claimNextPendingSandboxJob`（domain 新增，UPDATE ... FOR UPDATE SKIP LOCKED 原子认领置 running，多 worker 安全）→ `SandboxController.execute` → `updateSandboxJobStatus` + `onSandboxJobCompleted`（审计 + UsageLedger 记账）；`main()` 串行轮询，空闲/异常退避 2s；ESM 入口用 `import.meta.url` 守卫（本包 `"type": "module"`，无 require.main）。
- **updateSandboxJobStatus 合并写**：result 改 `COALESCE(result,'{}'::jsonb) || 新结果`，保留创建时存入的 idempotencyKey；result 缺省（纯状态推进）时不再动 result 列（旧逻辑会写成 null 连带冲掉幂等键）。选合并写而非新列，无需迁移 22。
- **单测**：`apps/science-worker/test/job-runner.test.ts` 7 例（无作业退避 / completed / timeout / failed / 执行器异常兜底 / 截断标记 / exitCode 推导），全 mock 接缝，不依赖 Docker。

## 2026-08-06（补二）— P1E-5 遗留四项修复：artifact 归属过滤、users.level 配额档、context 字段、迁移 21

### 修复内容
- **getSandboxArtifact 加 jobId 过滤**（`packages/domain/src/sandbox/jobs.ts`）：签名改 `(deps, jobId, artifactId)`，SQL 加 `AND job_id = ...`，防同 workspace 成员跨 job 猜测下载；路由调用点同步。
- **jobs.ts $queryRaw 列名对齐**（顺带修的潜伏 bug）：`SELECT *`/`RETURNING *` 返回 snake_case 键，camelCase 字段（workspaceId/createdAt 等）运行时为 undefined（路由 GET 会 500）；全部改显式列清单 + `AS "camelCase"` 别名。
- **users.level 配额档**（修复 4）：User 表本无 level 列（集成测试 `level: 'free'` 一直引用不存在字段）；迁移 21 `ALTER TABLE users ADD COLUMN level TEXT NOT NULL DEFAULT 'free'` + schema.prisma 同步；`CurrentUser` 加 `level`，`getCurrentUser` 选出；`/sandbox-jobs` 创建时 `userLevel: user.level` 传回 `checkPythonTaskQuota`，恢复 user_level 回退层。
- **context 字段**（修复 3）：迁移 21 加 `sandbox_jobs.context JSONB`；domain `createSandboxJob` 入参/落库、路由 schema/GET 响应、前端 `CreateSandboxJobRequest`/`SandboxJobView` 全链路透传。
- **限流核实**（修复 2，无需改码）：`RATE_LIMIT_ROUTES['/sandbox-jobs'] = 10/60s` 已配置，`rate-limit.ts` keyGen 用 `ip + route`（P1A-8 统一做法），不依赖 `req.user`，限流真实生效；设计文档 §4.1 的 `req.user.id` keyGen 是未实现的设想。
- **迁移 20 INSERT 缺列 bug（顺带修）**：quota seed 的 INSERT 目标 7 列、SELECT 仅 6 表达式且 scope 列错位，deploy 必报 42601；已补 `'user_level'` 常量（迁移 20 从未 commit/apply，改动安全）。
- 迁移 20–21 均待云上 deploy（云上写操作需用户确认）。

## 2026-08-06（补）— 交接复查：AGENTS.md 补更、迁移 20 规整、docs-sync 门禁脚本落地

### 背景
MVP 交接复查发现两类文档失真：AGENTS.md 自 P1B-2（1e859df，08-03）后未随收口更新；索引存在幻影条目。

### 修复内容
- **AGENTS.md 补更至 MVP 现状**：apps（api 50+ 端点全谱系 / web 四块前端 / agent-worker / science-worker）、packages（13 包，search/ui 仍占位）、infra（迁移 1–20、sandbox 镜像）、Overview 加 MVP 状态、文档分类表补 docs/security/。
- **沙箱迁移规整**：`packages/database/migrations/13,14`（游离于 prisma 流程外）→ 收编为 `infra/migrations/20260806020000_sandbox_jobs/`（幂等写法：IF NOT EXISTS / duplicate_object 捕获 / seed 存在性守卫，云上无论是否手工建过表均可安全 deploy）+ rollback.sql；原文件标 DEPRECATED 留存。
- **docs-sync 门禁脚本**：`scripts/docs/check-docs-sync.mjs`（检查 A 索引路径存在性 / B docs 目录反向登记 / C AGENTS 迁移数一致性），挂入根 `lint` 第三段（CI 自动覆盖）+ `audit:docs-sync` 独立入口。
- **脚本首跑检出并已修**：P1D-7 handoff 幻影登记（索引删行）、docs/proposals/ 目录缺失（补 .gitkeep）、AGENTS 迁移数漂移（1–19 → 1–20）。
- **P1E 补充索引勘误**：p1e-1/2 设计文档条目为幻影（已标注移除）；迁移路径登记错误（已改为实际路径）。

### 遗留
- 迁移 20 尚未云上 deploy（云上写操作需用户确认）。
- 若云上曾手工执行过 13/14 号 SQL，`migrate deploy` 因幂等写法可直接通过。

## 2026-08-06 — 🎉 MVP (Phase 0-1E) 全部完成！P1E-8 沙箱威胁模型与逃逸基线测试交付

### ✅ Phase 1E 轻量科学可视化完成

| 任务 | 状态 | 提交 | 详情 |
|------|------|------|------|
| P1E-1 | ✅ | dc04c04 | Visualization Planner 子 Agent |
| P1E-2 | ✅ | 1b6aa17 | Python AST 策略检查器（白名单模块+黑名单函数） |
| P1E-3 | ✅ | adffb60, 6c50561 | 沙箱基础镜像（Python 3.11 + 科学计算库） |
| P1E-4 | ✅ | ac8e362 | Sandbox Controller 与隔离 Docker 网络 |
| P1E-5 | ✅ | a6f6f88 | Sandbox Jobs API 与三维配额系统 |
| P1E-6 | ✅ | ddb21f2 | 可视化结果展示与 IndexedDB 临时存储 |
| P1E-7 | ✅ | 2ba9965, 9a41364 | 自然语言修改脚本与 diff 展示 + 自动任务切换 |
| P1E-8 | ✅ | 52ff62e | 沙箱威胁模型文档与逃逸基线测试 |

### P1E-8 交付物

**安全文档**（3 个，~2800 行）：
1. **[sandbox-threat-model.md](security/sandbox-threat-model.md)** (942 行)
   - STRIDE 威胁模型：6 大威胁类型（Spoofing/Tampering/Repudiation/Information Disclosure/DoS/Privilege Escalation）
   - 5 类具体攻击场景：网络突破/容器逃逸/资源耗尽/策略绕过/数据泄露
   - 多层防御（7 层）+ 残留风险评估（高/中/低）
   - 缓解路线图：P0 生产前必做 / P1 短期改进 / P2 中期改进
   - 事件响应流程：容器逃逸/DoS 检测与响应

2. **[sandbox-security-statement.md](security/sandbox-security-statement.md)** (469 行)
   - 安全承诺：6 大安全措施（网络隔离/资源限制/文件系统/权限/生命周期/审计）
   - 16 项基线测试：网络 3 + 资源 3 + 文件系统 2 + 逃逸 4 + 策略绕过 4
   - 用户责任与禁止行为
   - 法律免责声明（待法律团队审核）
   - 漏洞报告流程（负责任披露 + 90 天保密期）

3. **[production-security-checklist.md](security/production-security-checklist.md)** (661 行)
   - P0 生产前必做（5 大类）：独立 ECS/镜像扫描/监控告警/安全测试/法律审核
   - P1 短期改进：AST 引擎/并发限制/事件响应/CVE 监控
   - P2 中期改进：gVisor/AppArmor/外部日志归档/定期审查
   - 检查清单记录表 + 风险接受签字确认

**基线测试扩展**：
- [sandbox-escape.test.ts](../apps/science-worker/test/sandbox-escape.test.ts) (230 行)
  - 容器逃逸组（4 项）：Docker socket/特权提升/capabilities/设备节点
  - 策略绕过组（4 项）：动态导入/Base64/字符串拼接/pickle 反序列化
  - 防御验证：综合安全约束验证

**文档更新**：
- README.md: 添加安全文档入口（🔒 安全文档部分）

### 🏆 MVP 里程碑

**已完成 Phase**：
- ✅ Phase 0: 现有系统审计
- ✅ Phase 1A: 平台底座（Auth/Workspace/RBAC/配额/审计/CI/CD）
- ✅ Phase 1B: SDF 与版本（Schema/编辑器/存储/版本引擎/Diff/可见性）
- ✅ Phase 1C: 协作（Branch/Issue/PR/Review/作者组/许可/通知）
- ✅ Phase 1D: Hermes 与发布（AI Gateway/异步任务/Extractor/审核/申诉/审批/发布/公开页）
- ✅ Phase 1E: 轻量科学可视化（Planner/AST 检查/沙箱/作业 API/展示/修改/威胁模型）

**统计数据**：
- 总提交数：100+ commits
- 数据库迁移：19 个 migrations
- API 端点：50+ endpoints
- 测试覆盖：99/99 云上集成测试
- 文档：20+ 设计文档，10+ 计划文档

### ⏳ Next Steps

**生产前必做（P0）**：
- [ ] 独立 ECS 部署（沙箱与数据库物理隔离，§23 风险 5）
- [ ] 法律团队审核免责声明（责任限制/管辖法律条款）
- [ ] 第三方渗透测试
- [ ] 所有安全测试在 Docker 环境验证（16 项基线测试）
- [ ] 容器镜像安全扫描（Trivy/Clair 集成 CI）
- [ ] 监控告警配置（作业失败率/Docker daemon/审计日志）

**Phase 2 占位（不在 MVP 范围）**：
- Spec §19 功能清单：高级协作/高级可视化/企业版功能

---

## 2026-08-04 — P1D-8 发布事务与状态机推进完成：迁移 18 + /publications，云上 99/99，task-master 5.8 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：迁移 18 / 三重前置 / status+publish 端点 / parentVersion 链 / 幂等+不可变 |
| migration 18 | VersionStatus 枚举扩展（8 态 §4.1）+ Version.parentVersionId + rollback |
| domain publish/ | transitionVersionStatus（§4.1 状态机表 + 终态禁变更）+ publishVersion（AI 审核 passed + 许可齐全 + R3 确认 + assignPublicId 内联 + Publication UTC 时间戳/哈希/免责声明 + version.published 事件 + 审计只追加 + 幂等） |
| API | POST /versions/:id/status + POST /versions/:id/publish |
| 测试 | domain 单测 7 新增（275 总全绿）+ 集成 2 新增；**云上集成 99/99**（新增 P1D-8 2 + 既有 97）；迁移 18 applied |
| task-master 5.8 | done |

### Key Decisions / 坑
- **三重前置（§2.3-4）**：AI 审核 passed（P1D-5）+ 许可齐全（§6.3）+ R3 确认（§9.4）缺一拒绝
- **内容哈希（§6.2）**：coreJson + entries 共同参与（computeContentSha256 只算 entries，空 entries 版本哈希相同 → 改 corePart+entryPart）
- **ID 分配内联**：外层事务已开，避免 assignPublicId 嵌套事务（P1C-5 坑复用）
- **§6.2 免责声明**：LEGAL_DISCLAIMER 固定文案（不承诺专利/著作权/司法存证）
- **关键语义修正**：P1B-4 createCommit 原「latestVersion published → 拒绝」**过度严格**——§2.2-3 允许新 commit 产生增量版本（不原地修改）；移除拒绝，已公开不可变由发布管线保证
- **坑**：`/** */` 注释 Prisma 非法；删 published 检查后 latestVersion 变量仍被下游 diff 用（需保留声明）

### ⏳ Next Steps
- [x] ~~P1D-8 发布事务~~ 完成（2026-08-04）：迁移 18 + /publications，云上 99/99，5.8 done
- [ ] **P1D-9（task-master 5.9）**：公开 RO 页面与必显信息（§4.3 十标签 + 必显信息 + 免责声明 + public 可索引/private 拒绝 + SSR + /research/OSR/v/N）
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-后续）、Version 发布状态机（P1B-后续）

---

## 2026-08-04 — P1D-1 AI Gateway 统一路由与调用日志完成：ai-gateway 包，云上 86/86，task-master 5.1 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：fetch 直连 / 配置化回退 / audit 日志脱敏 / 手写 schema 守卫 / 流式占位 |
| ai-gateway 包 | provider.ts（Provider 接口 + OpenAiCompatProvider fetch 直连）+ gateway.ts（AiGateway：路由/回退/调用日志/completeStructured/stream）+ errors.ts |
| config | ApiEnv.ai（enabled/baseUrl/apiKey/primaryModel/fallbackModels，§24 占位） |
| 测试 | ai-gateway 单测 9 新增（9/9 绿）+ 集成 2 新增；**云上集成 86/86**（新增 P1D-1 2 + 既有 84） |
| task-master 5.1 | done |

### Key Decisions / 坑
- **fetch 直连（Q1）**：OpenAI 兼容 /chat/completions，零 SDK 依赖 + 可 mock；60s 超时
- **回退（Q2）**：providers 列表，primary 失败逐级回退 + fallbackReason 记录；全败 → ALL_PROVIDERS_FAILED
- **调用日志（Q3）**：deps.audit（action='ai.gateway.call'，字段：provider/model/inputTokens/outputTokens/latencyMs/error/fallbackReason）+ **脱敏**（只记元数据，绝不记 prompt/密钥，§17）
- **结构化（Q4）**：completeStructured + 手写 SchemaGuard + 重试上限 2
- **流式（Q5）**：stream() 接口占位（STREAM_NOT_IMPLEMENTED，5.3 实装）
- **坑**：apps/api 需加 @openscience/ai-gateway 依赖（集成测试 import 失败）；`_opts`/`_message` 不被 eslint 忽略 → void

### ⏳ Next Steps
- [x] ~~P1D-1 AI Gateway~~ 完成（2026-08-04）：ai-gateway 包，云上 86/86，5.1 done
- [ ] **P1D-2（task-master 5.2）**：Hermes 会话与异步任务通道（AgentSession/AgentTask + 队列 + SSE 进度）
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-后续）、Version 发布状态机（P1B-后续）

---

## 2026-08-04 — P1D-2 Hermes 会话与异步任务通道完成：迁移 15 + agent-worker，云上 88/88，task-master 5.2 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：三表迁移 / Redis List 队列 / 轮询进度 / worker handler 注册表 / 配额校验 |
| migration 15 | agent_sessions/agent_tasks/tool_approvals + AgentTaskStatus 枚举 + rollback |
| domain agent/ | createAgentSession/submitAgentTask（幂等键 + AI Credit 配额 §9.1）/getAgentTask/listAgentSessions/markTaskProgress（状态机 + 终态幂等 skip） |
| agent-worker | pollOnce（BRPOPLPUSH Redis 队列 + handler 注册表 + markTaskProgress）+ 主循环 |
| API | POST/GET /agent/sessions + POST /agent/tasks + GET /agent/tasks/:id |
| 测试 | domain 单测 5 新增（243 总全绿）+ 集成 2 新增；**云上集成 88/88**（新增 P1D-2 2 + 既有 86）；迁移 15 applied |
| task-master 5.2 | done |

### Key Decisions / 坑
- **队列（Q2）**：Redis List BRPOPLPUSH + processing 队列（崩溃恢复）；agent-worker poll 消费
- **消费者幂等（§16）**：任务状态机 pending→running→succeeded 单向前进；succeeded 后重放 → skip（不重复副作用）
- **进度（Q3）**：轮询 API（DB 进度，断线恢复天然）；SSE 5.3 增强
- **配额（Q5，§9.1）**：submitAgentTask 时 getBalance(ai_credit) ≤ 0 → INSUFFICIENT_CREDIT 409
- **坑**：Redis 队列跨运行持久化 → 陈旧任务 id poll 消费（findUnique null）→ beforeAll/afterAll 清 agent:queue；ai-gateway audit record 需 await（fire-and-forget 竞态 → 测试 undefined）；domain 需 ioredis type dep

### ⏳ Next Steps
- [x] ~~P1D-2 异步任务通道~~ 完成（2026-08-04）：迁移 15 + agent-worker，云上 88/88，5.2 done
- [ ] **P1D-3（task-master 5.3）**：SDF Extractor 建议式提取与确认写入（§9.2 + §5.4）
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-后续）、Version 发布状态机（P1B-后续）

---

## 2026-08-04 — P1D-3 SDF Extractor 建议式提取完成：worker handler + 编辑器通路，云上 90/90，task-master 5.3 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：worker sdf.extract handler / 建议存任务 result / 复用 P1B-8 草稿确认 / 轮询进度 / 按钮触发 |
| agent-worker extractor.ts | sdfCoreGuard（六字段 + schemaVersion const 校验 §5.1/§5.3）+ extractHandler（completeStructured + 不写 SDF §9.2） |
| worker 重构 | createHandlers(gateway) + createPollOnce（handler 注册表 + 注入 gateway） |
| 前端 | lib/api submitExtractTask/getAgentTask + lib/suggestions coreToSuggestions（逐字段 diff §5.4）+ SuggestionsPanel「AI 提取」按钮 + 进度条 + 轮询 |
| 测试 | agent-worker 单测 4 + web 3 新增（32 总）；**云上集成 90/90**（新增 P1D-3 2 + 既有 88） |
| task-master 5.3 | done |

### Key Decisions / 坑
- **提取不写 SDF（§9.2）**：extractHandler 只产出 core 建议，用户确认后经前端 updateSdf 落库
- **Schema 校验（§9.3）**：sdfCoreGuard 对齐 sdf-schema coreSchema（schemaVersion const '0.1.0' + 六字段 string）
- **确认写入（§5.4）**：coreToSuggestions → SuggestionsPanel 逐字段 apply → 草稿（P1B-8）→ updateSdf
- **R1 挂接**：整批批准升级 P1D-4
- **坑**：createPollOnce 重构破坏 agent.integration（pollOnce 直 import → createPollOnce）；`while(true)` no-constant-condition 不报但 eslint-disable unused 报

### ⏳ Next Steps
- [x] ~~P1D-3 SDF Extractor~~ 完成（2026-08-04）：worker + 编辑器通路，云上 90/90，5.3 done
- [ ] **P1D-4（task-master 5.4）**：R0-R4 分级审批与统一确认交互（§9.4）
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-后续）、Version 发布状态机（P1B-后续）

---

## 2026-08-04 — P1D-4 R0-R4 分级审批与统一确认交互完成：approval domain + /agent/approvals，云上 92/92，task-master 5.4 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：approvalLevel 纯函数 / ToolApproval 状态机含撤销 / buildConfirmation 五要素 / owner 权限 / 挂接登记 |
| 迁移 | 无（ToolApproval 表 P1D-2 迁移 15 已建） |
| domain approval/ | approvalLevel（R0-R4 映射 + 未知→R3 安全默认）+ buildConfirmation（§9.4 五要素 i18n）+ createApproval（R0 自动 + 同批去重）/approveApproval/rejectApproval/revokeApproval（状态机 + owner 校验 + 审计）/listPendingApprovals |
| API | GET /agent/approvals/pending + POST /:id/{approve,reject,revoke} |
| 测试 | domain 单测 10 新增（253 总全绿）+ 集成 2 新增；**云上集成 92/92**（新增 P1D-4 2 + 既有 90） |
| task-master 5.4 | done |

### Key Decisions / 坑
- **分级（Q1，§9.4）**：R0 读自动 / R1 草稿批量 / R2 协作任务内 / R3 Merge·发布·作者·许可·可见性 / R4 删除·所有权·密钥；未知 → R3
- **五要素（Q3）**：what/scope/reversible/estCost/estTime（buildConfirmation i18n 模板，中文优先）
- **同批去重（§9.4）**：同 task+scope approved → 返回既有不重复弹窗
- **撤销（§2.5-7）**：approved → revoked（状态机含）
- **坑**：approvalLevel 返回 number 需 as ApprovalLevel 断言；fake toolApproval update 需模仿 Prisma undefined 忽略（否则 scope 被覆盖）

### ⏳ Next Steps
- [x] ~~P1D-4 R0-R4 审批~~ 完成（2026-08-04）：approval domain，云上 92/92，5.4 done
- [ ] **P1D-5（task-master 5.5）**：发布审核硬阻断检查管线（§11.1 七类硬阻断 + AIReview 实体）
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-后续）、Version 发布状态机（P1B-后续）

---

## 2026-08-04 — P1D-5 发布审核硬阻断检查管线完成：迁移 16 + 七类硬阻断，云上 94/94，task-master 5.5 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：迁移 16 / 恶意代码扩展名黑名单 / Notification 事件 / 成员触发 / POST+GET review |
| migration 16 | ai_reviews（versionId @unique + status + hardBlocks/warnings Json）+ rollback |
| domain review/blocking.ts | 纯函数：checkCoreCompleteness（§5.1 六字段）/checkMaliciousArtifact（§11.1 危险扩展名+MIME）/checkSensitiveContent（§17 身份证/密钥/令牌）/checkProhibitedContent |
| domain review/publish-review.ts | runPublicationReview（七类 + AIReview upsert + 事件 + 审计）+ getPublicationReview（§11.3 稳定记录） |
| API | POST/GET /versions/:versionId/review |
| 测试 | domain 单测 8 新增（261 总全绿）+ 集成 2 新增；**云上集成 94/94**（新增 P1D-5 2 + 既有 92）；迁移 16 applied |
| task-master 5.5 | done |

### Key Decisions / 坑
- **七类硬阻断（§11.1）**：缺字段（版本 manifest core）/ 恶意代码 / 隐私泄露 / 违法内容 / 权限无法确认（非创建者）/ 缺许可 / manifest 缺失
- **AIReview（§15）**：versionId 唯一 + upsert 幂等 + 稳定可引用（§11.3 申诉）
- **事件（§16）**：ai_review.completed Notification
- **Safety Reviewer 不替代人工（§9.2）**：登记
- **坑**：core 应读**版本 manifest coreJson**（§7.2.3 快照）而非 sdfDocument（commit 不更新 sdfDocument）；fake version.findUnique 需 manifest include；entries 空 = 纯文本版本合法（仅校验 coreJson 存在）

### ⏳ Next Steps
- [x] ~~P1D-5 发布审核硬阻断~~ 完成（2026-08-04）：迁移 16 + 七类，云上 94/94，5.5 done
- [ ] **P1D-6（task-master 5.6）**：发布审核警告层与结构化审核报告（§11.2 七类警告 + 证据位置 + 不确定性）
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-后续）、Version 发布状态机（P1B-后续）

---

## 2026-08-04 — P1D-6 发布审核警告层与结构化审核报告完成：review.analyze handler，云上 95/95，task-master 5.6 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：AiWarning Schema / worker handler / AIReview.warnings 存储 / 不阻断 / 异步入队 |
| agent-worker reviewer.ts | AiWarningGuard（§11.2 七类 + evidence/uncertainty/suggestion 校验）+ reviewAnalyzeHandler（completeStructured + saveWarnings） |
| domain | saveWarnings（AIReview.warnings upsert 独立 status）+ getPublicationReview 返回 warnings |
| API | POST /versions/:id/review 同步硬阻断 + 异步入队 review.analyze |
| 测试 | worker 单测 4 新增（8 总）+ 集成 1 新增；**云上集成 95/95**（新增 P1D-6 1 + 既有 94） |
| task-master 5.6 | done |

### Key Decisions / 坑
- **§11.2 七类警告**：method_logic/statistical/figure_spec/data_consistency/reproducibility/missing_citation/overreach
- **结构化报告**：evidence（证据位置）+ uncertainty（不确定性）必须，**无单一分数**；prompt 约束不裁定对错/不伪造来源（§9.2）
- **不阻断（§11.2）**：warnings 更新不动 status（含警告版本仍可发布）
- **触发（Q5）**：POST /versions/:id/review 同步硬阻断 + 异步入队 analyze（不阻塞响应）
- **坑**：saveWarnings 需轻量 deps（AgentDeps 无 storage）；路由异步入队任务在测试队列里 → poll 需逐项消费直至目标任务完成

### ⏳ Next Steps
- [x] ~~P1D-6 警告层~~ 完成（2026-08-04）：review.analyze handler，云上 95/95，5.6 done
- [ ] **P1D-7（task-master 5.7）**：审核申诉流程与 Moderator 队列（§11.3 稳定记录 + Appeal + 人工处理审计）
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-后续）、Version 发布状态机（P1B-后续）

---

---
## 2026-08-04 — P1B-10 SDF 标准导出包生成与校验完成：export API + 脱库校验，云上 58/58，task-master 3.10 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：zip/附件归位/archiver/成员可导出/paper.md 汇编 |
| domain export/ | manifest.ts（§5.3 序列化 + contentHash）+ packager.ts（buildExportPackage 重建 §5.2 目录树 + classifyArtifact）+ validate.ts（脱库校验 §5.3 MUST） |
| API | GET /versions/:id/export（archiver zip 流 + Content-Disposition） |
| 测试 | domain export 9 + api 集成 3 = 12 新增；本地门禁全绿；**云上集成 58/58**（新增 P1B-10 3 + 既有 55） |
| task-master 3.10 | done + details |

### Key Decisions / 坑
- **五决策**：zip（archiver）；附件按扩展名归位 figures/code/artifacts；成员可导出 + public 公开；paper.md 六字段汇编
- **§2.2.1** SDF 数据库表达 + 可导出文件包；**§5.3 MUST** 不依赖平台 DB 可读
- **§5.3 contentHash** = P1B-6 computeContentSha256 排序聚合
- archiver CJS 函数 vs @types 类 → createRequire(__dirname)；validate 返回 { ok } 非 { valid }；manifest.objectId 需 OSR ID（测试先 assignPublicId）

### ⏳ Next Steps
- [x] ~~P1B-10 导出包~~ 完成（2026-08-04）：export API + 云上 58/58，3.10 done
- [ ] **P1B-11（task-master 3.11）**：待任务清单
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-后续）、Version 发布状态机（P1B-后续）、真实 AI 提取（Phase 1D SDF Extractor）、experiments/code 附件归位填充（Phase 1D）

---
## 2026-08-04 — P1B-9 移动端分步/抽屉编辑器与可访问性完成：Drawer + 虚拟化 + WCAG AA，next build 通过，task-master 3.9 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：自写 Drawer/顶栏 tab/XHR 进度/窗口虚拟化/自写 focus trap |
| Drawer.tsx | 自写抽屉（aria-modal + focus trap + Esc + 焦点还原，§18.3） |
| MobileTabs + EditorLayout | 顶栏 tab（大纲/编辑/面板）+ 响应式（桌面三栏 / 移动单栏 + 抽屉，§5.4/§18.2 不删功能） |
| VersionList | 窗口虚拟化（pageVersions 纯函数 + IntersectionObserver 滚动加载，§18.3） |
| ArtifactUploader | XHR onprogress 进度条 + 失败重试（§18.3 可恢复） |
| WCAG AA | :focus-visible 焦点环 + nav/main/aside 语义化 + aria-label + role="alert" + 键盘导航 |
| 测试 | web 17（mobile pageVersions 4 新增）；next build 通过；本地门禁全绿 |
| task-master 3.9 | done + details |

### Key Decisions / 坑
- **五决策**：自写 Drawer（无 headlessui）；顶栏 tab + 抽屉（§5.4 不删功能）；XHR 真实进度（fetch 无原生）；窗口虚拟化（无 react-window）；自写 focus trap
- **§18.2** 移动端三栏改分步/抽屉不删功能；**§18.3** 键盘/焦点/语义化/对比度/虚拟化/进度
- fetch 上传无进度 → XHR onprogress（api.ts uploadArtifact 死代码删除）
- pageVersions 抽纯函数供单测（组件 state 难测）

### ⏳ Next Steps
- [x] ~~P1B-9 移动端 + 可访问性~~ 完成（2026-08-04）：Drawer + 虚拟化 + WCAG AA，3.9 done
- [ ] **P1B-10（task-master 3.10）**：待任务清单
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-后续）、Version 发布状态机（P1B-后续）、真实 AI 提取（Phase 1D SDF Extractor）、E2E 浏览器测试（Phase 1D）

---
## 2026-08-04 — P1B-8 三栏 SDF 编辑器桌面端完成：apps/web 编辑器 + 建议确认 + 版本导航，next build 通过，task-master 3.8 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：Markdown/react-markdown + next-intl + useReducer + localStorage 草稿 + 预置建议 |
| web 基础设施 | lib/api.ts（fetch 封装对接现有 API）+ lib/editor-state.ts（reducer + 草稿）+ lib/suggestions.ts（建议状态机） |
| 三栏布局 | EditorLayout（240+300px）+ OutlinePanel（六字段大纲 + 版本导航）+ CoreEditor（Markdown 六字段 + 预览）+ SuggestionsPanel（建议 diff 卡片）+ ArtifactUploader（P1B-3 管线） |
| 主页面 | app/research-objects/[id]/edit：草稿恢复横幅 + 错误面板 + 保存/提交 + 版本 diff 导航 |
| i18n | messages/zh.json + en.json（§2.5.5 中文优先，文案全走 useTranslations） |
| 测试 | web 13（reducer 4 + 草稿 4 + 建议 4 + 合同 1）；next build 通过；本地门禁全绿 |
| task-master 3.8 | done + details |

### Key Decisions / 坑
- **五决策**：Markdown（§5.4 Markdown 先行）；next-intl（§2.5.5 中文优先）；useReducer 草稿；localStorage（§18.3 自动保存）；预置建议（Phase 1D extractor 接同通路）
- **§5.4 MUST 建议确认**：应用 → 写草稿（不直接写 SDF）→ 保存 PATCH 落库
- **§18.3 错误提示**：重试/保存草稿/问题定位
- page 组件相对路径 4 层；knip web project 加 components/lib glob；localStorage node 测试 mock

### ⏳ Next Steps
- [x] ~~P1B-8 编辑器~~ 完成（2026-08-04）：apps/web 三栏 + next build，3.8 done
- [ ] **P1B-9（task-master 3.9）**：待任务清单
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-后续）、Version 发布状态机（P1B-后续）、真实 AI 提取（Phase 1D SDF Extractor）

---
## 2026-08-04 — P1B-7 RO 可见性模型与 API 权限强制完成：迁移 11 + 三态矩阵 + 扩大审批记录，云上 55/55，task-master 3.7 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：VisibilityGrant 表/扩大阻断+请求/public 可索引/匿名 public/变更幂等 |
| migration 11 | visibility_grants（ro+grantee 唯一）+ visibility_requests（from/to_visibility + status）+ rollback |
| domain | visibility/：errors + access（canAccessRo 三态矩阵 §4.2 + requireRoAccess 越权 404）+ requests（requestVisibilityChange 缩小应用/扩大阻断+请求/幂等 + grantVisibility） |
| API | GET /research-objects/:id 改 canAccessRo + POST /:id/visibility（扩大 202/缩小 200）+ POST /:id/visibility-grants；error-map VisibilityError（REQUEST_PENDING=409） |
| 读操作改造 | getResearchObject/getSdfDocument 用 requireRoAccess（invite_only grant 可读） |
| 测试 | domain visibility 10 + api 集成 5 = 15 新增；本地门禁全绿；**云上集成 55/55**（新增 P1B-7 5 + 既有 50） |
| task-master 3.7 | done + details |

### Key Decisions / 坑
- **五决策**：invite_only 用 VisibilityGrant（§4.2 指定账户）；扩大可见性立即阻断 + VisibilityRequest(pending)（§4.2 显式审批，审批流 Phase 1D）；public 可索引；/research/* 仅 public 匿名；变更幂等
- **§3.3 API 层强制**：所有资源路由统一走可见性判定，禁仅前端隐藏
- **§17 越权防护**：跨 Workspace/invite_only 未 grant/绕过前端 → 404
- GET 路由 canAccessRo + domain requireMembership 双层冲突 → domain 读操作改 requireRoAccess
- 测试断言 /空间不存在/ → /研究对象不存在/（VisibilityError）

### ⏳ Next Steps
- [x] ~~P1B-7 可见性~~ 完成（2026-08-04）：迁移 11 + 云上 55/55，3.7 done
- [ ] **P1B-8（task-master 3.8）**：待任务清单
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-8）、Version 发布状态机（P1B-后续）、大文件分片（P1B-后续）、AI diff 摘要（Phase 1D）

---
## 2026-08-04 — P1B-6 标识层与时间戳服务完成：packages/identity + 迁移 10 + /research 公开 URL，云上 50/50，task-master 3.6 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：UUID v7 手写/publicId 发布时分配/公开 ID 全局递增/公开 URL 仅 public/内容哈希排序聚合 |
| packages/identity | uuid7（RFC 9562 手写）+ public-id（OSR-YYYY-NNNNNN 生成/解析 + 版本 ID -vN + 稳定 URL） |
| migration 10 | research_objects.public_id + versions.public_version_id（unique）+ identifiers/publications 表（legal_disclaimer 预留 §6.2）+ rollback |
| config | publicIdPrefix env（PUBLIC_ID_PREFIX 缺省 OSR，§24 配置项禁写死） |
| domain | assignPublicId（发布时分配 + updateMany 并发安全 + ID 永不复用 §6.1）+ computeContentSha256（§6.2 哈希聚合） |
| API | GET /research/:publicId + /research/:publicId/v/:versionNo（匿名 public 可见，private 404） |
| 测试 | identity 11 + domain 6 + api 集成 5 = 22 新增；本地门禁全绿；**云上集成 50/50**（新增 P1B-6 5 + 既有 45） |
| task-master 3.6 | done + details |

### Key Decisions / 坑
- **五决策**：UUID v7（§6.1 内部主键，可排序）；publicId 发布时分配（P1B-7 触发）；OSR-YYYY-NNNNNN（年 + 全局 seq，前缀配置化）；/research/* 仅 public 匿名；contentSha256 排序聚合
- **ID 永不复用**（§6.1）：assignPublicId 同 RO 复用，updateMany where publicId=null 并发安全
- **时间戳**（§6.2）：Publication 只追加 + legal_disclaimer 字段预留
- fake Prisma 需同步 identifier count/create；research 路由多余 import 移除

### ⏳ Next Steps
- [x] ~~P1B-6 标识层~~ 完成（2026-08-04）：packages/identity + 云上 50/50，3.6 done
- [ ] **P1B-7（task-master 3.7）**：Version 发布状态机（draft→published，§4.1、§2.3.4）
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-8）、大文件分片（P1B-后续）、AI diff 摘要（Phase 1D）

---
## 2026-08-04 — P1B-5 多类型确定性 Diff 服务完成：packages/diff 九类 diff + comparison API，云上 45/45，task-master 3.5 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：不引 diff 库（LCS）/大二进制 1MB/CSV 行 diff/作者引用 input 传入/成员鉴权 |
| packages/diff | types（DiffType 九类）+ lines（LCS 行 diff）+ text-code/sdf/authors-citations/file/table/license + computeDiff 聚合 |
| domain | compareVersions（读两 Manifest + Blob size → computeDiff，不读对象内容 §7.2.6） |
| API | GET /versions/:from/comparison?to=:to |
| 测试 | diff 22 + domain 4 + api 集成 4 = 30 新增；本地门禁全绿；**云上集成 45/45**（新增 P1B-5 4 + 既有 41） |
| task-master 3.5 | done + details |

### Key Decisions / 坑
- **五决策**：§7.3 九类 diff 全部落地（文本/SDF 字段 RFC 6902/结论/作者/引用/文件增删哈希/表格/代码/许可证可见性）；§7.2.6 大二进制 >1MB 仅元数据（metadata_only）；确定性 diff 是事实来源，AI 摘要 Phase 1D
- **§7.1 差异区分**：DiffType 枚举区分文字/结构化/代码/数据/图表/结论
- LCS hunk 公共行不单独成 hunk（flush 只增删时触发）
- loadBlobSizes 误写 fromManifest.map（应为 entries.map）
- computeDiff 的 diffCode Phase 1D 接 Blob 内容后启用

### ⏳ Next Steps
- [x] ~~P1B-5 Diff 服务~~ 完成（2026-08-04）：packages/diff 九类 + 云上 45/45，3.5 done
- [ ] **P1B-6（task-master 3.6）**：待任务清单（读 task-master 3.6）
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-8）、Version 发布状态机（P1B-7）、大文件分片上传（P1B-后续）、AI diff 摘要（Phase 1D）

---
## 2026-08-04 — P1B-4 Commit/Manifest 版本引擎完成：迁移 9 + /commits /versions API，云上 41/41，task-master 3.4 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：ChangeSet 单 op / 初始 core 基准 / Version 仅 draft / Branch 表建 default main / artifact diff 自动算 |
| migration 9 | branches/commits/changesets/versions(version_no + VersionStatus)/version_manifests/manifest_entries 六表 + rollback |
| versioning 包 | patch.ts（fast-json-patch@3.1.1 applySdfPatch/diffSdfCore/validatePatch）+ manifest.ts（rebuildCore/buildSnapshot）；补 main/types + test |
| domain | commit/：errors + createCommit（乐观锁/幂等/公开不可变/Manifest 生成）/getVersion/rebuildVersion（blob sha256 校验） |
| API | POST /research-objects/:id/commits（Idempotency-Key）+ GET /versions/:id + /rebuild；error-map CommitError |
| 测试 | versioning 13 + domain commit 9 + api 集成 6 = 28 新增；本地门禁全绿；**云上集成 41/41**（新增 P1B-4 6 + 既有 35） |
| task-master 3.4 | done + details |

### Key Decisions / 坑
- **五决策**：ChangeSet 存单 op（§7.2.5 RFC 6902 apply 链）；初始 core = SdfDocument.coreJson 基准；Version 仅 draft（P1B-7 发布）；Branch 表建 default main（Phase 1C 扩展）；artifact 传完整集合 diff 自动算增删改（§7.2.4 复用 Blob）
- **公开不可变**（§2.2.3）：最新版本 published → commit 409 VERSION_PUBLISHED
- fake researchObject 缺 update 方法（只 updateMany，createCommit 用 update）
- Buffer.toWeb 不可 for-await 迭代（fake getObject 改 Readable.from）
- Operation[] → Prisma InputJsonValue 需 as unknown as 双转换

### ⏳ Next Steps
- [x] ~~P1B-4 版本引擎~~ 完成（2026-08-04）：迁移 9 + 云上 41/41，3.4 done
- [ ] **P1B-5（task-master 3.5）**：多类型确定性 Diff 服务（§7.3 九类：文本/SDF 字段/结论/作者/引用/文件增删哈希/表格/代码/许可证可见性，§7.2.6 大二进制仅元数据 diff）
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-8）、Version 发布状态机（P1B-7）、大文件分片上传（P1B-后续）

---
## 2026-08-04 — P1B-3 Blob 内容寻址存储 + 上传管线完成：迁移 8 + /artifacts API，云上 35/35，task-master 3.3 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：Blob 存储键分段 / logicalPath 非唯一 / MIME 失败允许上传 / file-type dynamic import / 配额只读不扣费 |
| migration 8 | blobs（sha256 主键 + storage_key + size）+ artifacts（logical_path/mime_type/size/blob_sha256/uploaded_by/workspace_id）+ rollback |
| Prisma | Blob + Artifact model + User/Workspace 关联 |
| storage | blob.ts：putBlob 去重（§7.1）/getBlob/headBlob/deleteBlob/getBlobStorageKey（分段键）；补 package.json main/types（P1A-2 漏，本任务暴露） |
| domain | artifact/：errors/mime（file-type@22 dynamic import）/quota（复用 resolvePolicy）/scan（占位）/artifacts（createArtifact 管线 + getArtifact） |
| API | /artifacts/upload POST（multipart）+ /artifacts/:id/download GET；error-map FILE_TOO_LARGE=413/MALICIOUS_FILE=451；app.ts storage 注入（缺省不注册） |
| config | api-env 加 storage（S3_* env） |
| 测试 | storage 9 + domain 11 + api 集成 6 = 26 新增；本地门禁全绿；**云上集成 35/35**（新增 P1B-3 6 + 既有 29） |
| task-master 3.3 | done + details |

### Key Decisions / 坑
- **五决策**：Blob 存储键 `blobs/<h2>/<h4>/<sha256>`；Artifact.logicalPath 非唯一（P1B-4 Manifest 去重）；MIME 失败允许上传（mimeType=null + 审计）；file-type ESM-only 用 dynamic import（全仓 esnext 破坏 CJS）；配额只读不扣费（P1B-6 记账）
- **detectMimeType 消费 Readable 流 → putBlob 再读空流 size=0**（集成测试抓到，改先统一转 Buffer）
- **MinIO 对象持久化跨测试运行** → afterAll 需删对象（DB 清行不够），否则 alreadyExists 误命中
- **限流测试跨运行残留（P1A-8 存量 flaky）**：rl key 窗口 3600s，前置清 key 修
- storage package.json 缺 main/types（P1A-2 从未被消费，P1B-3 首次暴露）
- cloud-sync 需 .cloud-sync-env（从 .env 中文键生成，本机临时重建）

### ⏳ Next Steps
- [x] ~~P1B-3 Blob 存储~~ 完成（2026-08-04）：迁移 8 + 云上 35/35，3.3 done
- [ ] **P1B-4（task-master 3.4）**：版本引擎 + Version Manifest 引用 Artifact（§16、§7.2.3）
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-8）、大文件分片（P1B-5）

---
## 2026-08-03 — P1B-2 RO/SDF 数据模型完成：迁移 7 + API 骨架，云上集成 26/26，task-master 3.2 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 三决策：UUID v4 沿用（v7 归 P1B-6）、SDFNode 固定六型枚举、visibility 本任务建（private 默认） |
| migration 7 | research_objects/sdf_documents/sdf_nodes + RoStatus 9 枚举/RoVisibility/SdfNodeType + rollback |
| Prisma | 三 model + Workspace/User 关系；RO.version 乐观锁字段（与 P1B-4 版本引擎复用） |
| domain | research-object/：types（常量）/errors/research-objects（create/get/update 乐观锁）/sdf（validateSdfCore 合同 + 乐观锁） |
| API | /research-objects POST/GET/PATCH + /sdf GET/PUT；error-map ResearchObjectError（CONCURRENT_UPDATE→409） |
| 测试 | domain 18 新增（创建原子/乐观锁 409/合同校验/越权 404）；本地门禁全绿；**云上集成 26/26**（新增 P1B-2 5 + 既有 21） |
| task-master 3.2 | done + details |

### Key Decisions / 坑
- **三决策**：UUID v4（一致性）；SDFNode 固定六型（对齐 SDF_CORE_FIELDS）；visibility 字段 P1B-2 建（P1B-7 只加强制不迁移）
- **RO.version = 乐观锁 = 版本引擎版本号**（§16 复用同一字段，P1B-4 推进）
- **sdf-schema P1B-1 漏 main/types**：消费方（domain）测试才发现，已补（P1B-1 只自测没暴露）
- domain 测试子目录相对路径坑（../src → ../../src）
- create RO 同事务建 RO + SDFDocument + 六 node（原子）+ 审计

### ⏳ Next Steps
- [x] ~~P1B-2 数据模型~~ 完成（2026-08-03）：迁移 7 + 云上 26/26，3.2 done
- [ ] **P1B-3（task-master 3.3）**：Blob 内容寻址存储 + 上传管线（SHA-256 键 + Artifact 元数据 + 分片/校验/MIME/病毒扫描，步骤 14）
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema additionalProperties 债务（0.2.0）

---
## 2026-08-03 — P1B-1 SDF Schema 包完成：core + manifest JSON Schema + ajv 校验，task-master 3.1 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 两决策 + 实证测试：手写 JSON Schema draft-07 + ajv（非 zod）；additionalProperties 宽容（技术债务） |
| core Schema | `core.ts`：六必填字段（§5.1）+ SDF_CORE_FIELDS 常量 + SdfCore 类型；`schemaVersion const 0.1.0` |
| manifest Schema | `manifest.ts`：§5.3 全字段 + objectId/versionId OSR pattern + visibility 三态 + licenses 三类 + SdfManifest 类型 |
| 校验 | `validate.ts`：ajv draft-07 + ajv-formats，模块级编译缓存，结构化错误；validateSdfCore/validateManifest |
| 测试 | core 6 + manifest 8 = 14，本地门禁全绿（build/typecheck/lint 0/audit 无新增/docs 0） |
| task-master 3.1 | done + details（决策/落点/坑） |

### Key Decisions / 坑
- **手写 JSON Schema + ajv**（§5.3 规范要求 JSON Schema 文件，§5.2 目录树 core.json 即数据文件；非 zod）
- **additionalProperties 宽容 = 技术债务**（实证三场景：空壳可选字段放行未定型数据、严格 false 误伤 draft_meta 等附加键、宽容兼容未来字段）——0.1.0 六字段 required 严格 + 附加键容忍；**0.2.0 可选字段定型时收紧 additionalProperties:false**（§5.3 语义化版本）
- **可选字段不预置**：§5.1 只给名字无结构，0.1.0 猜结构比没有更危险，升级版本时逐个加
- **ajv 默认不开 format** 需 ajv-formats（publishedAt date-time）；as const Schema 不能 cast JSONSchemaType
- 测试用 `SDF_CORE_FIELDS` 常量遍历断言缺字段（非硬编码六名）

### ⏳ Next Steps
- [x] ~~P1B-1 SDF Schema~~ 完成（2026-08-03）：14 测试，3.1 done
- [ ] **P1B-2（task-master 3.2）**：RO/SDFDocument/SDFNode 数据模型 + 迁移，/research-objects + /sdf API 骨架（步骤 2）
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、**SDF Schema additionalProperties 债务（0.2.0 收紧）**

---
## 2026-08-03 — P1A-9 CI/CD 部署完成：生产栈上线 + 备份/恢复演练 + QQ SMTP，task-master 2.9 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate + spec + plan | `docs/specs/2026-08-03-p1a-9-cicd-deploy-backup-design.md`（三决策 + QQ SMTP 偏离）、`docs/plans/2026-08-03-p1a-9-cicd-deploy-backup-plan.md`（9 任务 TDD） |
| Task 1-2 | SmtpMailer 实装（nodemailer QQ SMTP 真发）+ config mailerDriver/SMTP env + index.ts 生产启动阻塞解除（P1A-3 throw 移除） |
| Task 3 | `docker-compose.prod.yml`：data_net（postgres/redis 无端口映射，不绑公网）+ app_net（api 127.0.0.1:3001）双网卡，生产零默认值 |
| Task 4 | `.github/workflows/ci.yml`：GitHub Actions，build/typecheck/lint/test |
| Task 5-6 | `deploy.sh`（dry-run + --confirm 8 步链）+ `backup.sh`（pg_dump 保留 7 轮）+ backup-restore.md 四节 |
| 云上部署 | 生产栈 up（postgres/redis/api healthy）→ 迁移 6 applied（容器内跑）→ seed 8/8 → HTTPS 反代 + /admin basic_auth + 安全头 + 限流 429/Retry-After → 备份 24K + 恢复演练行数一致 + cron 0 3 → QQ SMTP 真发链路通 |
| task-master 2.9 | done + details（三决策/落点/坑） |

### Key Decisions / 坑
- **三决策**：GitHub Actions CI（免自建 runner）；仅 PostgreSQL dump（对象存储快照后置）；临时库恢复演练（不碰生产）
- **QQ SMTP 真发**（§3 偏离）：nodemailer 实装 SmtpMailer，MAILER_DRIVER=smtp 缺省，P1A-3「生产拒绝启动」阻塞解除；邮件真发不吞不丢
- **cert HTTP-01 被阿里云拦**（403）→ 改 **DNS-01**（Cloudflare API，CF_Token，绕开 80 端口）
- **Prisma alpine/musl 缺 openssl** → api image 用 node:22（debian），schema binaryTargets +linux-musl
- **安全基线生产接线缺口**：index.ts 此前没传 trustProxy/限流/helmet/CSRF/CORS（P1A-8 仅测试接线）→ 补全生产启用
- **invite/migrate 需容器内跑**（生产 postgres 无端口映射，宿主机 `postgres:5432` 解析不到）
- **api 生产绑 0.0.0.0**（容器内 nginx 反代可达），compose 限宿主 127.0.0.1 外部不可达
- **backup.sh 需 --env-file .env.prod**（compose 插值 POSTGRES_*）

### ⏳ Next Steps
- [x] ~~P1A-9 CI/CD~~ 完成（2026-08-03）：生产上线，2.9 done
- [ ] **Phase 1A 剩余收口**：deploy.sh 全自动 runbook 验证、CI 首跑确认（Actions 页面，本机不可见）
- [ ] **P1A-10+（1B 起）**：Research Object / 上传 / AI Gateway / 发布 等业务 Phase（task-master 3.x）
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障（ADR-003）

---
## 2026-08-03 — P1A-8 安全基线完成：限流/CSRF/CORS/helmet/trustProxy/nginx 强认证，云上集成 21/21 全绿

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate + spec + plan | `docs/specs/2026-08-03-p1a-8-security-baseline-design.md`（逐节确认四决策）、`docs/plans/2026-08-03-p1a-8-security-baseline-plan.md`（8 任务 TDD） |
| Task 1 | `database/rate-limit.ts` Redis 固定窗口纯函数（INCR+EXPIRE 同 multi 原子，fail-open） |
| Task 2 | `config/api-env.ts` +4 env：allowedOrigins（逗号串→数组）/rateLimitEnabled/rateLimitLoginLimit/rateLimitLoginWindowSec |
| Task 3 | `api/security/rate-limit.ts` Fastify 封装（RATE_LIMIT_ROUTES 声明表=挂接点，429+Retry-After+审计 security.rate.limited） |
| Task 4 | `api/security/security.ts` CSRF 双提交（@fastify/csrf-protection，/csrf-token 端点）+ CORS 白名单（@fastify/cors）+ helmet 全套头；error-map FST_CSRF*→403 CSRF_INVALID |
| Task 5 | `app.ts` trustProxy 构造选项（生产 1/dev 0） |
| Task 6 | `infra/nginx/openscience.conf`（API 反代 + /admin basic_auth + XFF 透传）+ `ADR-003-admin-strong-auth`（nginx basic_auth 双层，TOTP 列上线路障）+ 部署 runbook 填充 |
| 本地门禁 | build/typecheck/lint(0)/单测 database 12+config 9+api 50/audit:knip 无新增 unused/audit:dep 0 errors/docs:lint 0 全绿 |
| 云上收口 | cloud-sync → install+全量 build → `test:integration` **21/21 全绿**（新增 security 4：限流 429+Retry-After+审计、CSRF 403/通过、helmet 头、trustProxy + 既有 17 回归）；task-master 2.8 置 done |

### Key Decisions / 坑
- **四决策**：限流手写 Redis 固定窗口（不引 @fastify/rate-limit）；CSRF @fastify/csrf-protection 双提交（HMAC 模式，cookie 存 secret + x-csrf-token 头）；安全头 @fastify/helmet（CSP default-src 'none'）；/admin nginx basic_auth + platform_admin + 审计双层（TOTP 上线路障，ADR-003）
- **trustProxy 是限流前置**：云上经 nginx，不信任代理则 req.ip 全 127.0.0.1 → 全站共享单桶；生产 trustProxy:1 + nginx 透传 XFF
- **@fastify/csrf-protection 错误名是 FastifyError 非 FST_CSRF***：error-map 须匹配 `code` 前缀而非 `name`
- **集成测试 Redis 桶隔离**（P1A-7 共享库教训 Redis 版）：server 端 key 空间全局共享，独立 redis client 不隔离限流桶 → 所有用例 trustProxy:true + 唯一 X-Forwarded-For → 独立桶（也验证 trustProxy 真实价值）
- **限流 fail-open**：Redis 不可用放行 + 审计 warning，不因限流依赖打挂服务

### ⏳ Next Steps
- [x] ~~P1A-8 安全基线~~ 完成（2026-08-03）：云上集成 21/21，2.8 done
- [x] ~~P1A-9 CI/CD~~ 完成（2026-08-03）：生产上线，2.9 done
- [ ] parked 不变：P1A-3 终审项、P1A-5 deferred ①；新增上线路障：**/admin TOTP 二次验证**（web 有 UI 后补，ADR-003）

---
## 2026-08-03 — P1A-7 配额/AI Credit 账务骨架本地完成：门禁全绿，云上集成待执行

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate + spec + plan | `docs/specs/2026-08-03-p1a-7-quota-credits-design.md`（逐节确认：AI Credit 累积余额 B/行级 policy/流水统一账本/保守占位 seed）、`docs/plans/2026-08-03-p1a-7-quota-credits-plan.md`（9 任务 TDD） |
| Task 1 | migration 6 `20260803000000_quota_usage`（quota_policies + usage_ledger，UNIQUE scope+scopeKey+resource / idempotency_key）+ Prisma model（schema String 非 enum，对齐 SQL TEXT） |
| Task 2-5 | domain `src/usage/`：policies.ts（workspace→user_level→global 三层回退，未命中 null）、ledger.ts（只追加 SUM(delta)、recordEntry period 校验、topupCredit 同事务+审计）、grants.ts（月度授予纯函数+applyMonthlyGrants 幂等）、limits.ts（checkLimit 纯函数） |
| Task 6 | `scripts/seed-quota.mjs`（幂等 upsert，--dry-run/--confirm）+ `src/usage/seed-data.ts` 占位值集中一处；root package.json 加 `@openscience/domain` devDep（seed 脚本解析） |
| Task 7 | `/admin/quota-policies`（GET/PUT）、`/admin/credits`（POST，Idempotency-Key 防重）、`/admin/usage`（GET）；admin.ts 抽 `requirePlatformAdmin` 复用；usage 写操作同事务审计（quota.policy.upsert / quota.credit.topup） |
| Task 8 | `/usage` 用户侧聚合（user 级资源 user_level→global + workspace 级资源逐空间）+ `getUsageSnapshot`；error-map 加 UsageError 映射 |
| 本地门禁 | build/typecheck/lint(0)/单测 domain 83+api 39/audit:dep 0 errors/audit:knip 0 unused/audit:dup 31（+2 集成测试样板，容忍）/docs:lint 0 全绿 |
| 云上收口 | tar-over-ssh 同步（`scripts/cloud-sync.mjs` 固化，SSH 经 `ssh-run.sh`）→ install+全量 build → migration 6 applied → seed-quota 8/8（幂等重跑不增行）→ `test:integration` **17/17 全绿**（database 2 + storage 1 + api 14：workspaces 5 + admin 4 + auth 3 + usage 5）；云上残留 `.npmrc` 手工 rm（tar 无删除语义，用户确认）；task-master 2.7 置 done |

### Key Decisions / 坑
- **AI Credit 累积余额（用户选 B）**：余额 = ledger 全量 SUM(delta)；monthly_grant 每月 +N 不清零；policy(ai_credit) 语义 = 每月授予量非余额上限；不设 cap
- **行级 policy**：一资源一行，三层回退；未命中返回 null（无限制，不做 0 误判）
- **占位值不进 migration**：走 seed 脚本幂等 upsert，数值集中 `seed-data.ts`，§24 定案改一处
- **`usage_ledger.idempotency_key` UNIQUE** 支撑 admin topup 重试幂等（§16 幂等键）；P2002 → UsageError.DUPLICATE_IDEMPOTENCY_KEY → 409
- **fake prisma 扩展**：quotaPolicy/usageLedger/user.findMany/aggregate；user.findMany `notIn` 过滤初始实现 bug（`u.status === where.status` 恒 false）已修
- **knip 抓 unused export**：`getUsageByPeriod` 无消费方 → 从 index 移除导出（保留实现+测试，未来挂接）
- **Prisma unique where 对 nullable scopeKey** 期望 string → admin-usage.ts 显式 cast
- **Prisma upsert 复合唯一键不接受 nullable `scope_key`**：seed 脚本 + admin-usage.ts 原用 `upsert` 均抛 `Argument scopeKey must not be null` → 改 `findFirst` + `create/update`（保留 null 语义，spec §2.1 不变）
- **迁移 6 的 scope/kind 用 String 而非 Prisma enum**：对齐 SQL TEXT，app 层 zod 校验（z.enum）

### ⏳ Next Steps
- [x] ~~云上收口~~ 完成（2026-08-03）：migration 6 applied + seed 8/8 + 集成 17/17 全绿；task-master 2.7 done
- [ ] P1A-8：安全基线（限流、会话安全、管理后台强认证）
- [ ] parked 不变：P1A-3 终审项、P1A-5 deferred ①

---
## 2026-08-01 — P1A-6 统一错误/日志/配置/审计底座完成：云上集成 15/15 全绿，task-master 2.6 置 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate + spec + plan | `docs/specs/2026-08-01-p1a-6-audit-observability-design.md`（四节逐节确认）、`docs/plans/2026-08-01-p1a-6-audit-observability-plan.md`（9 任务 TDD，SDD 执行）；design gate 确认两处偏离：/admin 真查询接口（原文"占位"）、authz.deny 入审计 |
| Task 1-4 | config 实装（api env 迁入 + `DEFAULT_DEV_*` 共源，`cd0d355`）→ observability pino 日志 + 双闸脱敏（`b984fa6`）→ 统一 ErrorBody + requestId 三方串联（`eec8981`）→ AuditLog 表（迁移 5 `20260801143000_audit_log` + rollback）+ prismaAuditSink（`7bbf043`） |
| Task 5-8 | domain 11 处 workspace 写操作同事务审计（`3729ac0`）→ auth 5 函数审计（login 成败均记、失败只记原因码，`dade692`）→ API 装配（loggerInstance/ctx/authz.deny，`7b4dd0f`）→ `/admin/audit-logs`（platform_admin 首个消费方，游标分页，`31d55bc`） |
| 终审 + fix wave | whole-branch review 2 Critical（实测复现）：sanitizeValue 无环保护（真 socket 请求即崩）+ Error 实例被掏空（500 丢栈）→ 一次 fix（WeakSet + Error 直通 + 真 HTTP 回归用例，`193e65a`）→ scoped re-review 3/3 ADDRESSED；deferred minor triage：fix-later ×3（session-guard 401 requestId / malformed cursor 400 / eslint-disable 清理），其余 ship-as-is |
| 云上收口 | tar-over-ssh 同步（含 3 个陈旧删除文件手工清理：env.ts×2 + dev-defaults.ts）→ install+全量 build → 迁移 5 applied → `test:integration` **15/15 全绿**（database 2 + storage 1 + api 12：workspaces 5 + admin 4 + auth 3） |
| task-master | 2.6 置 done（details 已记录两处偏离与架构落点）；Phase 1A 剩 2.7–2.9 |

### Key Decisions / 坑
- **AuditSink 接口放 observability 而非 domain**：domain → auth 依赖已存在（Mailer 类型），auth → domain 会成环；接口放叶子包 observability（type-only），实现 prismaAuditSink 放 database。新增依赖边 domain/auth→observability、database→observability/config，均无环
- **fastify 5 注入 pino 实例必须用 `loggerInstance`**：`Fastify({ logger: <实例> })` 启动即抛 `FST_ERR_LOG_INVALID_LOGGER_CONFIG`；测试全绿是因为测试从不传 logger——终审实测抓出，已加真 socket 回归用例（`logger-injection.test.ts`）
- **集成测试串行化（`fileParallelism: false`，`e8d69de`）**：api 集成文件共享同一 PG/Redis 且 afterAll 全表清理（每个文件假设独占干净库），3 文件并行时 admin 的 cleanup 抹掉 workspaces「并发双 accept」夹具（membership 被删 → 0 行），单文件跑全过、全量跑必挂；串行后稳定 15/15
- **tar-over-ssh 不带删除语义**：云上残留已被本分支删除的 `apps/api/src/env.ts` 等 3 文件致 build 失败；本次手工 rm 清理（用户批准），后续部署脚本需考虑 `rsync --delete` 或等价机制
- **knip 守门抓住残留依赖**：fix 后 api 不再直接 import pino（类型改 FastifyBaseLogger），`pino` 直接依赖变 unused → 移除（`90ddcbd`）

### ⏳ Next Steps
- [ ] P1A-7：配额/存储额度（task-master 2.7，先 design gate）
- [x] ~~parked：终审 deferred minor ×3~~ 已清（2026-08-01 遗留清理：session-guard 401 带 requestId、malformed cursor→400 + 2 用例、eslint-disable 清零 lint 0 warning；root `workspaces` 收敛为 apps/*+packages/*——`scripts/verify-workspace.mjs:35` 依赖该字段，P1A-2「冗余」判定有误，infra/* 为死配置已删）
- [x] ~~`.worktrees/p1a-1` 残留~~ 已清理（worktree remove + 分支删除，已合并 main 无丢失）
- [x] ~~云上 `/tmp/repro-invite.mjs`~~ 已不存在（此前运维清理已带走）
- [ ] parked：P1A-3 终审 parked 项（邀请码模偏差 99bit 熵、`PORT=''`→0、`void main()` 无 catch 等，归 P1A-3 范围后续处理）；P1A-5 deferred ①（WorkspaceRole 穷尽性校验，1B 扩展角色前补）③（spec §3 示例缺 deps，已随本次清理修正）

---

## 2026-08-01 — 出网通道选型定案（SSH 隧道胜）+ 监控面板上线（Netdata + vnStat）

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 出网通道实测 | 直连基线：Docker Hub/HF 被墙、PyPI 极慢（12s）、GitHub/npm/MiniMax 正常；**SSH 反向隧道**（`ssh -R 7890` → 本机 v2ray）打通全部目标，吞吐 1.2–2.1MB/s 与直连持平；**Tailscale** 因本机 CGNAT 打洞失败纯走海外 DERP 中继（360ms+），实测吞吐仅 12–14KB/s，不成立 |
| 稳定性 soak | 15 轮 × 2min：**SSH 隧道 15/15**（gstatic 1.19–1.27s、docker hub 1.38–1.45s，方差极小）；**Tailscale 13/15**（2 次 >15s 超时，延迟 2.2–10.1s 抖动剧烈）。选型定案：SSH 隧道 |
| 监控面板上线 | `portainer.428312321.xyz/monitor/`（Netdata，274 charts 实时流式）+ `/traffic/`（vnStat 账单页，cron 每 5min 渲染）；basic_auth（账号 admin，凭据云上 `/etc/nginx/.htpasswd-monitor` 不入库）；Playwright 外网实测双面板通过 |
| 收尾七项 | `/nav/` 统一导航页（三入口互跳）；basic_auth 改 admin；`with-proxy` 兜底脚本（隧道失效回落直连，云上 `/usr/local/bin/`）；Tailscale 完全卸载（包/服务/repo/状态目录）；云上 /tmp 调试残留 + 本机测试截图清理；`.gitignore` 加 `.playwright-mcp/` |
| 隧道常驻化 | 本机 Windows 计划任务 `OpenScience-ProxyTunnel`（登录自启，vbs 隐藏窗口 → `proxy-tunnel.sh` 循环重连：15s 心跳/5s 重试/日志截断）；服务器杀会话实测 35s 内自愈；提交 `6ba730b`（监控+通道定案）`1bc62be`（隧道常驻化），均已 push origin/main |

### Key Decisions / 坑
- **Tailscale 与阿里云内网系统性冲突**：tailscaled up 劫持 `100.64.0.0/10` 路由（tailnet 段），阿里云 VPC 内部 DNS（100.100.2.136/138）恰在该段 → 全机 DNS 瘫痪（yum/apk/内网服务全挂），策略路由优先级高于 main 表 /32 例外。已 `tailscale down` 恢复；结论：此服务器不宜跑 tailscaled
- **dockerd 出网也要走隧道**：daemon.json 里 9 个 registry mirror 全部失效，直连 registry-1.docker.io 被墙 → dockerd systemd drop-in 代理（`127.0.0.1:7890`）+ restart dockerd（portainer restart=always 自恢复，dev 栈三容器无 restart 策略需手动 start）
- **nginx 子路径反代 Netdata 两坑**：① `proxy_pass` URI 带变量时 nginx 不自动追加 query string，必须 `$ndpath$is_args$args`（症状：registry hello 400 "need to set an action"）② Connection 头需 map 映射，空 Upgrade 时不得发 "Connection: upgrade"
- **服务器 nginx 仅 TLS 1.3**：Git Bash 自带 curl 握手必失败（exit 35），验证用浏览器/Playwright 或 `openssl s_client`
- AL4 无 vnstat 包（EPEL 不兼容）→ alpine 容器跑 vnstatd（apk 走 mirrors.aliyun.com），host 网络读网卡计数器，数据卷 `vnstatdb`

### ⏳ Next Steps
- [ ] P1A-6：审计日志（task-master 2.6，先 design gate）

---

## 2026-08-01 — P1A-5 RBAC 云上收口完成：集成测试 11/11 全绿，task-master 2.5 置 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 终审 | whole-branch review（87e426b..f4caf06）：Ready to merge = Yes；无 Critical/Important；3 项 deferred minor triage 为非阻塞（fix later ×2 / ship as-is ×1）；终审复跑 domain 36/36 + api 34/34 |
| 提交与推送 | `f4caf06`（集成用例+文档+knip 修复）`f4ff738`（progress 修正），已 push origin/main；P1A-5 全部 6 commits 在库 |
| 云上收口 | tar-over-ssh 同步（排除 .env/.git/node_modules/dist 等）→ install → `migrate deploy`（迁移 4 `20260801010000_user_platform_role` applied）→ 全量 build → `test:integration` **11/11 全绿**（database 2 + storage 1 + api 8，含 RBAC 新 2 用例：viewer PATCH→403 含守卫先于 body 校验、非成员→404、无 session→401） |
| task-master | 2.5 置 done（details 已于本日早些时候同步修订）；Phase 1A 剩 2.6–2.9 |

### Key Decisions / 坑
- **云上集成测试前必须全量 build**：首轮 `test:integration` 3 用例 500/400 失败，根因是云上只 build 了 database（为 prisma generate），`packages/domain/dist` 停留在 07-31 不含 `can`——守卫 `import { can } from '@openscience/domain'` 解析到旧 dist 得 undefined，调用即 TypeError→500；通过的路由恰好都在 `can()` 之前短路（401/404）。教训：vitest 跑 TS 源，但跨包 import 解析到目标包 dist，云上/新环境必须先 `npx pnpm@9.15.0 build` 全量再跑集成测试；AGENTS.md 已同步修正
- 调试路径：先看失败面（挂 invite 的 3 个全挂、不挂的全过）→ repro 脚本验证裸 prisma 链路正常 → 定位 dist 过期；未改任何业务代码
- 云上遗留：`/tmp/repro-invite.mjs` 调试脚本待清理（rm 需 --confirm，下次云操作时顺手）

### ⏳ Next Steps
- [ ] 提交本次 progress/AGENTS 回填（需用户批准）并 push
- [ ] P1A-6：审计日志（task-master 2.6，先 design gate）——RBAC 守卫与 domain 已留 `// audit(2.6)` 挂接点
- [ ] parked：`.worktrees/p1a-1` 残留清理；P1A-3 终审 parked 项；终审 deferred minor ×3（角色穷尽性校验/eslint-disable/spec §3 示例缺 deps）

---

## 2026-08-01 — P1A-5 RBAC 本地完成（全门禁绿），集成测试留待云上

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate + spec + plan | `docs/specs/2026-08-01-p1a-5-rbac-design.md`（四节已确认）、`docs/plans/2026-08-01-p1a-5-rbac-plan.md`（5 任务 TDD）均已批准并登记索引 |
| Task 1-4 实现与提交 | 迁移 4 `User.platformRole`（`d8365e9`）→ domain 动作×角色权限矩阵（`5e03493`）→ domain 角色检查收敛 `requireAction`（`ace9d04`）→ API 统一 preHandler 守卫（`f2dab74`） |
| Task 5 本地部分（未提交） | `apps/api/test/workspaces.integration.test.ts` 追加「P1A-5 RBAC 守卫（云上）」2 用例（viewer PATCH→403 含守卫先于 body 校验、非成员→404、无 session→401）；`vitest list` 确认收集、不本机运行（无 Docker） |
| 测试证据 | 全量门禁 exit 0：build / typecheck / lint（0 error，1 个已知 deferred warning）/ test 单测 **116/116**（database 4 + storage 10 + auth 32 + domain 36 + api 34）/ audit:knip / audit:dep（0 errors，11 orphan warnings 基线）/ audit:deps / audit:dup / docs:lint 0 issues |

### Key Decisions / 坑
- 权限判定落点从 task-master 2.5 原文「packages/auth」改为「packages/domain（workspace 模块）+ apps/api preHandler 守卫」，auth 包保持纯身份层——design gate 用户已确认的偏离，task-master 2.5 details 已同步修订（2026-08-01，追加 info）
- 守卫与 domain 双层各自查 membership（共源矩阵），双查开销已登记接受
- Task 4 遗留 1 项 plan-mandated Minor（`workspace-guard.test.ts` unused eslint-disable 警告）deferred 到终审统一处理
- knip 预存回归修复：`task-master-ai`（07-31 入 root devDependencies 供 `.mcp.json` MCP server 直连）被 audit:knip 判 unused 致 exit 1（基线 stash 验证与本次改动无关）；已在 `knip.json` root `ignoreDependencies` 补登，与 @prisma/client/prisma 同例，**knip.json 需纳入本次提交**

### ⏳ Next Steps
- [x] ~~终审（requesting-code-review）~~ 已完成（见 2026-08-01 收口条目）
- [x] ~~提交待用户批准：集成测试文件 + progress/index + spec/plan + knip.json~~ 已提交 `f4caf06`
- [x] ~~云上收口~~ 已完成，11/11 全绿（见 2026-08-01 收口条目）
- [x] ~~云上全绿后置 task-master 2.5 done~~ 已置 done

---

## 2026-07-31 — 阿里云收口完成：云上集成测试 9/9 全绿，2.2/2.3/2.4/2.10 置 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 云上环境 | Alibaba Cloud Linux 4（148G/30G）；dnf 安装 `nodejs 22.23` + `docker-compose-plugin 2.26.1`；docker 已启动；代码 tar-over-ssh 同步至 `/opt/openscience`（排除 .env/.git/node_modules，密钥不上云） |
| SSH 打通 | 项目专用密钥 `~/.ssh/id_ed25519_xgs`（comment `openscience-xgs-aliyun`），经用户在控制台 Workbench 装公钥后连通；`~/.ssh/config` 加 Host 条目，`checkup.sh`/`ssh-run.sh` 直接可用；巡检通过 |
| Cloudflare DNS | `OpenScience.428312321.xyz` A → 阿里云公网 IP（DNS-only，即时生效，nslookup 验证） |
| 迁移 deploy | 3 个迁移（baseline_app_meta / auth_baseline / workspace_baseline）云上全部 applied |
| 集成测试 | 云上 `npx pnpm@9.15.0 test:integration` exit 0：**database 2/2**（PG SELECT 1 + 迁移落库 ≥3 + Redis ping/set/get/del）、**storage 1/1**（MinIO put/head/get/delete + sha256）、**api 6/6**（auth 3 + workspaces 3，含真实 PG 并发双 accept 竞态用例——P1A-3 终审建议已落实） |
| task-master | 2.2 / 2.3 / 2.4 / 2.10 全部置 done；Phase 1A 剩 2.5–2.9 |
| 提交 | `1efd327` feat: P1A-4 实现；`418e4c9` test: 云上集成测试修复与 database/storage 集成用例；工作树干净，未 push |
| VS Code MCP | 新建 `.vscode/mcp.json`（VS Code 格式 + `cmd /c npx` 包装）；**未提交**，待 key 轮换决定 |
| Portainer | 云上 `portainer/portainer-ce:lts` 容器运行中，仅绑 127.0.0.1:9443/8000（restart=always），访问走 SSH 隧道 |
| 密钥不入库 | `.mcp.json` 移出 git 跟踪（`git rm --cached`），`.gitignore` 补 `.mcp.json` + `.vscode/mcp.json`；本地文件保留，kimi-code/Cursor/VS Code 均不受影响（commit `chore: .mcp.json 含明文密钥移出 git 跟踪`） |
| VS Code MCP 修复 | npm 11.6.1 在 VS Code 环境跑 `npx --package` 报 `Cannot read properties of null (reading 'package')`；按 ADR-002 改为 `task-master-ai` 入 root devDependencies，`.vscode/mcp.json` 直连 `node node_modules/task-master-ai/dist/mcp-server.js`，绕过 npx/cmd 包装，已验证 server 正常启动 |
| SSH 隧道修复 | `~/.ssh/config` Host 条目补域名别名 `openscience.428312321.xyz`（原仅 IP，域名连接匹配不到 IdentityFile 导致 Permission denied）；域名直连 SSH 已验证 |
| Portainer 443 反代 | DNS `portainer.428312321.xyz` A 记录已建；云上 nginx 1.30.2 + acme.sh v3.1.3（gitee 镜像）+ cronie 续期守护；`infra/nginx/portainer.conf` 入库并部署 `/etc/nginx/conf.d/`；安全组放行 80/443 后 LE 证书已签发（standalone → install-cert 挂续期 reload）→ nginx enable --now；验证：80→301、443 200、/api/status 返回 v2.39.5。**面板入口：https://portainer.428312321.xyz（免 SSH 隧道）** |

### Key Decisions / 坑
- 代码修复（未提交，待批准）：① `auth.integration.test.ts` repoRoot 少退一级（`__dirname`=apps/api/test 需三级到仓根），本机无 Docker 从未运行故未暴露；② database/storage 补上`test:integration` 脚本悬空的实体文件（vitest.integration.config.ts + 真实集成用例）；③ auth 包移除悬空 `test:integration` 脚本（真实闭环由 api 套件覆盖）
- 首次递归 build 时 auth 先于 database 的 `prisma generate` 执行会报 `Invitation` 不存在——新环境 clone 后须先 build database（或全量重跑一次）；登记为已知坑
- 服务器不装宝塔：与本仓 compose + infra/scripts 管理路线冲突且扩大攻击面；用户已知情，后续如需可视化再议 Portainer
- 服务器密码在对话中明文出现过，建议用户在阿里云控制台轮换实例密码（SSH 已纯密钥）
- **安全问题（待用户处理）**：`.mcp.json` 硬编码的 MiniMax 代理 key 已随 `ce9da28` 提交并推送到 GitHub，处于泄露状态；建议轮换 key + 从 git 历史/跟踪中清除 + 此后 key 走本机环境变量。`.vscode/mcp.json` 因此暂缓提交

### ⏳ Next Steps
- [ ] 用户批准后提交：P1A-4 实现 + 云上集成测试修复（一个 commit 或拆两个）
- [ ] P1A-5：RBAC 权限矩阵（task-master 2.5，先 design gate）
- [ ] parked：`.worktrees/p1a-1` 残留清理；P1A-3 终审 parked 项（见 07-28 条目）

---

## 2026-07-31 — 阿里云收口启动：DNS 已通，SSH 待用户装公钥

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 状态对齐 | 2026-07-28 P1A-3 handoff 已被 07-29 条目超越：P1A-3 已提交推送（`e4e3bc9`）、P1A-4 本地完成（单测 107/107 全绿）；P1A-2/3/4 共同待办只剩云上集成测试 |
| task-master 2.10 | 新增子任务「阿里云环境完善与云上集成测试收口（P1A-2/3/4）」，验收 = 三包集成测试全绿 + 2.2/2.3/2.4 置 done + DNS 生效 |
| Cloudflare DNS | `OpenScience.428312321.xyz` A 记录 → 阿里云公网 IP 已创建（zone `428312321.xyz` active，proxied=false DNS-only，TTL auto）；`nslookup` 已解析到正确 IP，即时生效 |

### Key Decisions / 坑
- DNS 走 Cloudflare API token（.env `CLOUDFLARE_API_TOKEN_428xyz`，脚本内引用未打印）；proxied=false 保留全端口可用（SSH 等），后续要 CDN/TLS 代理可再开
- SSH 卡点：服务器仅 publickey 认证（密码登录已禁，SSH_ASKPASS 也行不通）→ 已生成项目专用密钥 `~/.ssh/id_ed25519_xgs`（comment `openscience-xgs-aliyun`，无 passphrase 供 BatchMode 自动化）；需用户在阿里云控制台 Workbench/VNC 把新公钥装入 `/root/.ssh/authorized_keys`；known_hosts 主机密钥已 keyscan 录入，`~/.ssh/config` 已加 Host 条目（IdentityFile 指向新密钥，`ssh-run.sh`/`checkup.sh` 装完即可直接用）

### ⏳ Next Steps
- [ ] 用户安装新公钥（`id_ed25519_xgs.pub`）后：重跑 `checkup.sh` 巡检 → 云上起 dev 栈 → migrate deploy → 三包 `test:integration`（2.10 主体，云上写操作前逐项确认）
- [ ] 全绿后置 task-master 2.2/2.3/2.4/2.10 done，进 P1A-5 RBAC design gate

---

## 2026-07-29 — P1A-4 Workspace 本地完成（全门禁绿），集成测试留待阿里云

### ✅ Completed

| 任务 | 详情 |
|---|---|
| 依据文档 | spec：`docs/specs/2026-07-29-p1a-4-workspace-design.md`；plan：`docs/plans/2026-07-29-p1a-4-workspace-plan.md` |
| 迁移 3 | `infra/migrations/20260729010000_workspace_baseline`（三表：Workspace / Membership / WorkspaceInvitation + 部分唯一索引，附 rollback.sql；本机未 deploy，待云上执行） |
| packages/domain | 首个领域模块（workspace：personal 创建/CRUD/成员/转让/邀请状态机），32 单测全绿；三条不变量（personal 拒绝操作/last_owner/归档只读）均有用例 |
| packages/auth | `verifyEmail` 加可选 `onEmailVerified` 回调（同事务注入），2 回归用例全绿 |
| apps/api | `/workspaces` 15 端点（最小内联权限：非成员 404/越权 403）+ 错误映射 8 码 + 401，14 单测全绿；`index.ts` 生产接线 `onEmailVerified` |
| 云上集成测试 | `apps/api/test/workspaces.integration.test.ts` 已创建（3 用例：全流程/越权负向/并发双 accept），本机仅验证 vitest 收集与 tsc strict 类型，未运行（需 Docker，留待阿里云） |
| 测试证据 | 全量门禁 exit 0：build / typecheck / lint（ESLint + WORKSPACE_STRUCTURE_OK）/ test 单测 107/107（database 4 + storage 10 + auth 32 + domain 32 + api 29）/ audit:knip（零新增 hint）/ audit:dep（0 errors，11 orphan warnings，domain 已接线不再是 orphan）/ audit:deps / audit:dup / docs:lint 0 issues |

### Key Decisions / 坑

- Personal Workspace 经 `onEmailVerified` 回调注入创建（auth→domain 无运行时耦合，失败整体回滚）；生产与集成测试 buildApp 均须带该接线
- 错误处理平行于 AuthError：`WorkspaceError` + SCREAMING_SNAKE 8 码（对齐既有约定），api 侧 `WORKSPACE_ERROR_HTTP` Record 编译期强制全覆盖
- fake prisma 在 domain/api 两处刻意复制（跨包不能引测试目录，P1A-3 同款模式），`audit:dup` 报告按既定裁决接受，不抽共享测试包（YAGNI）
- 邀请预指派角色收窄为非 owner（zod `nonOwnerRoleSchema`），所有权只能经 transfer 产生；list 类查询逐行查关联（N+1 登记接受，1B 再改 include）
- lint 收尾修正 4 处（domain 测试未用导入 + 3 处 `any` 标注），纯类型/导入清理无逻辑变更
- task-master 2.4 按 test-gate 纪律保持 pending，云上集成测试全绿后才置 done

### ⏳ Next Steps

- [ ] 阿里云就绪后：`node packages/database/dist/migrate-cli.js deploy` + 三包（database/storage/api）`test:integration` 全绿，后置 task-master 2.2/2.3/2.4 done
- [ ] P1A-5：RBAC 权限矩阵（先 design gate）

---

## 2026-07-29 — P1A-4 Workspace design gate 通过（用户逐节确认）

### ✅ Completed

| 任务 | 详情 |
|---|---|
| P1A-3 提交状态核实 | P1A-3 已全部提交并推送：`e4e3bc9 feat: P1A-3 邀请码注册与邮箱验证 Auth`，main 与 origin/main 同步，工作树干净；上一份 handoff 的"未提交"风险已解除 |
| P1A-4 design spec | `docs/specs/2026-07-29-p1a-4-workspace-design.md`：三张新表（workspaces/memberships/workspace_invitations + rollback）、`packages/domain` 首个领域模块、`/workspaces` 15 端点、最小内联权限检查（成员→404/角色→403）、9 项错误码；用户逐节确认（数据模型/领域逻辑/API/错误与测试） |

### Key Decisions / 坑

- Personal Workspace 在**邮箱验证通过时**创建，与用户状态迁移同事务；auth→domain 依赖用回调注入（`verifyEmail` 加可选 `onEmailVerified`）
- 邀请机制：按邮箱邀请 + 显式 accept/decline；独立 `workspace_invitations` 表（不复用平台 invitations）；accept/decline 枚举面统一 404
- Membership 角色全量 6 档（owner/maintainer/author/contributor/reviewer/viewer）；personal 空间纯单人不可邀请
- 本任务只做最小内联权限检查，完整 RBAC 归 2.5；审计只留挂接点注释，接线归 2.6；不引入乐观锁（全部单资源短事务，spec §2 已记理由）
- task-master 2.4 按 test-gate 纪律保持 pending，云上集成测试全绿后才置 done

### ⏳ Next Steps

- [ ] 用户审阅书面 spec 后：writing-plans 出 P1A-4 实施计划
- [ ] 阿里云就绪后：migrate deploy + 三包（database/storage/api）集成测试，全绿后置 2.2/2.3/2.4 done
- [ ] spec/plan 文档提交（需用户逐次批准）

---

## 2026-07-28 — P1A-3 终审通过（fix wave 完成），本地阶段收尾

### ✅ Completed

| 任务 | 详情 |
|---|---|
| 终审 | 全范围 final review：无 Critical；1 Important（生产无真实 Mailer 时 outbox 静默吞邮件）+ 5 项 Minor fix-now；其余 6 项 parked |
| fix wave | 单次修复：`apps/api/src/index.ts` 生产启动守卫（无 Mailer 即 throw，plan/spec 已同步）；两处 fake `updateMany` 守卫修正（`??` 对 null 也触发致守卫恒真）；cookie sameSite/path 断言 + logout 无 cookie 用例；集成测试 afterAll 补 mailOutbox 清理 + 用例 3 标题修正；AGENTS.md 概览段对齐 |
| re-review | 6 项全 ADDRESSED；残留 1 项 plan 文档守卫写法不一致，controller 已同步；全门禁 exit 0，单测 59/59（58+logout 用例） |

### Key Decisions / 坑

- parked（后续）：邀请码模偏差（99 bit 熵）、env.test REDIS_URL 用例、`PORT=''`→0、`void main()` 无 catch、`--days Infinity`、verifyEmail 锁定/过期分支泄露待验证状态（register 409 本就是更大枚举面，登记接受）
- 终审建议：云上集成测试补一个真并发用例（两请求同码注册，断言恰好一个 201）——guarded updateMany 的真实竞态分支只有真实 PG 能走到
- SDD ledger：`.superpowers/sdd/2026-07-28-p1a-3-invitation-auth-plan/`（保留，云上续跑用）

### ⏳ Next Steps

- [ ] 用户批准后提交 P1A-3（plan Task 6 Step 11 检查点）
- [ ] 阿里云就绪后：P1A-2 + P1A-3 集成测试一并执行（migrate deploy → `test:integration` ×3 个包），全绿后置 task-master 2.2/2.3 done
- [ ] P1A-4：Workspace（task-master 2.4，先 design gate）

---

## 2026-07-28 — P1A-3 邀请码注册与邮箱验证本地完成，集成测试留待阿里云

### ✅ Completed

| 任务 | 详情 |
|---|---|
| 依据文档 | spec：`docs/specs/2026-07-28-p1a-3-invitation-auth-design.md`；plan：`docs/plans/2026-07-28-p1a-3-invitation-auth-plan.md` |
| 迁移 2 | `infra/migrations/20260728010000_auth_baseline`（四表：User / Invitation / EmailVerification / MailOutbox，附 rollback.sql；本机未 deploy，待云上执行） |
| packages/auth | 30 单测全绿：密码（argon2）、邀请码（含原子防并发核销）、邮箱验证码（6 位 + 限次 + 静默重发冷却）、session（Redis 7 天滑动过期）、DevOutboxMailer；登录未知邮箱路径加 DUMMY_PASSWORD_HASH 抹平计时侧信道 |
| apps/api | Fastify `/auth` 路由（register/verify-email/resend-verification/login/logout/me）+ env 校验 + 错误映射，14 单测全绿；`openscience_session` HttpOnly cookie |
| 邀请码 CLI | `scripts/invite.mjs`（create/list/revoke；root `npx pnpm@9.15.0 invite`）；无参演示 exit 64 + Usage（不需数据库） |
| 云上集成测试 | `apps/api/test/auth.integration.test.ts` + `vitest.integration.config.ts` 已创建，本机仅验证 vitest 收集（3 用例列出）与 tsc strict 类型检查通过，未运行（需 Docker，留待阿里云） |
| 测试证据 | 全量门禁 exit 0：build / typecheck / lint（ESLint + WORKSPACE_STRUCTURE_OK）/ test 单测 58/58（database 4 + storage 10 + auth 30 + api 14）/ audit:knip（仅占位 hint）/ audit:dep（0 errors，12 orphan warnings 占位基线）/ docs:lint 0 issues |

### Key Decisions / 坑

- Task 3 评审后三处安全加固已落地并反映在代码：① 邀请码核销改 guarded `updateMany` 原子操作防并发双核销；② resend 冷却改静默 202（消除 invited 状态枚举通道）；③ login 未知邮箱加 DUMMY_PASSWORD_HASH 抹平计时侧信道
- 集成测试用例 2/3 断言放宽（400/409 之一、登录 200）因用例间共享用户状态，强断言已由单测覆盖；云上可按需拆用户收紧
- 本机无 Docker（用户指示），迁移 2 未 deploy、集成测试未跑；task-master 2.3 按 test-gate 纪律保持 pending，不置 done

### ⏳ Next Steps

- [ ] 阿里云就绪后：云上 `node packages/database/dist/migrate-cli.js deploy` + `npx pnpm@9.15.0 --filter @openscience/api test:integration`，通过后置 task-master 2.3 done
- [ ] P1A-4：Workspace（task-master 2.4，先 design gate）

---

## 2026-07-28 — 基线提交 + 最小工具集落地

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 基线提交 | `ce9da28`（chore: P1A-1 Monorepo 骨架 + P1A-2 数据基础基线提交，127 个文件；不含 .env / node_modules / dist） |
| 提交与推送 | 工具集提交 `79878c1`；`ce9da28`+`79878c1` 已推 origin/main（用户批准），工作树干净，git 单点丢失风险解除 |
| ESLint 9 | eslint 8→9 + `@eslint/js` + `typescript-eslint`；`eslint.config.cjs` 重写为 flat config（recommended + 4 处带注释窄域豁免：migrate-cli `require.resolve`、redis 空 error listener、.cjs 的 require、scripts Node 全局量）；`lint` = `eslint . && node scripts/verify-workspace.mjs`，exit 0 |
| knip | `knip.json`（pnpm workspaces 配置）；`audit:knip` exit 0，仅剩占位包预期 hint（test 目录预留、.prisma 生成物） |
| dependency-cruiser | `.dependency-cruiser.cjs`（no-circular / 禁跨包相对深引用 error，orphan warn）；`audit:dep` exit 0，0 errors / 13 orphan warnings（占位包入口，预期基线） |
| jscpd | `audit:dup` exit 0，0 clones（20 文件 / 2942 tokens，0.00%） |
| syncpack | `audit:deps`（v15 以 `syncpack lint` 取代已废弃 `list-mismatches`）exit 0，0 版本不一致；仅提示 root package.json 无 version 字段（private 包，无害） |
| markdownlint | `.markdownlint-cli2.jsonc`（保结构规则，豁免 MD013/060/058/022/032/034/029 排版风格，各附一行理由）；修 5 个文档 7 处明显问题（MD056 表格内管道符转义、EOF 多余空行、5 处围栏补语言、2 处围栏补空行）；`docs:lint` exit 0，19 文件 0 issues |
| 回归 | `build` / `typecheck` / `test` 全绿：单测 14/14（database 4 + storage 10） |

### Key Decisions / 坑
- syncpack v15 已废弃 `list-mismatches`，脚本用等价的 `syncpack lint`（报告中注明偏离）
- `@eslint/js` 须与 eslint 同主版本（^9 配 9.39.5），初次解析到 ^10 产生 peer 冲突已纠正
- knip 深层 peer warning（oxc-parser wasm 绑定）在 Windows x64 无害，走原生绑定
- 全程零 git mutation、零业务源码改动；完整证据见 `.superpowers/sdd/tooling-setup-report.md`

### ⏳ Next Steps
- [ ] P1A-3：邀请码注册与邮箱验证 Auth（task-master 2.3，先 design gate）
- [ ] 阿里云就绪后：云上 `npx pnpm@9.15.0 test:integration`（task-master 2.2），通过后置 done

---

## 2026-07-28 — P1A-2 终审通过（fix wave 完成），本地阶段收尾

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 终审 | 全范围 final review（final-review-package.md）：无 Critical；1 Important（redis 无 error listener，plan 原文固有→用户裁决：修代码+同步 plan/design）+ 4 Minor fix-now；其余 parked |
| fix wave | 单次修复：`packages/database/src/redis.ts` 默认空 error listener（plan Task 2 Step 8 与 design §4 已同步修订）；`migrate-cli.ts` spawn 失败打印诊断；AGENTS.md infra/ 行与 `stack:logs` 补登；`.env.example` 补尾换行。验证：`@openscience/database` build/typecheck exit 0、单测 4/4、生产守卫演示仍 Refused |
| re-review | scoped re-review：5 项发现全部 ADDRESSED，无新破坏 |

### Key Decisions / 坑
- redis 语义变化：redis 不可用时不再打挂宿主进程，改为静默重试；消费方可自加 `client.on('error', ...)`（JSDoc 与 design 已注明）
- parked（后续处理）：生产缺 `DATABASE_URL` 静默回落 dev URL（建议 P1A-3 随 auth env 校验）；`S3_PORT` NaN 无校验；root `package.json` `workspaces` 字段冗余（P1A-1 遗产）；minio-init until 环无上限（既定设计）
- SDD ledger 保留在 `.superpowers/sdd/2026-07-28-p1a-2-data-foundation-plan/`，云上续跑 Task 4/5 时复用

### ⏳ Next Steps
- [ ] 阿里云就绪后：云上 `npx pnpm@9.15.0 test:integration`（Task 4/5），通过后置 task-master 2.2 done
- [ ] P1A-3：邀请码注册与邮箱验证 Auth（task-master 2.3，先 design gate，本地可做）

---

## 2026-07-28 — P1A-2 代码实现完成，集成测试留待阿里云

### ✅ Completed
| 任务 | 详情 |
|---|---|
| dev 栈 | `infra/compose/docker-compose.dev.yml`（postgres:16/redis:7/minio 固定 tag + minio-init 建 bucket）与 `stack:up\|down\|ps` 脚本已就位，端口仅 127.0.0.1；按用户指示本机未起栈 |
| packages/database | Prisma 5.22 + 基线迁移 `app_meta`（含 rollback.sql 补偿）；`createPrismaClient`/`createRedisClient`；迁移 runner 生产守卫 |
| packages/storage | StorageAdapter 接口 + MinIO 实现（put/get/head/delete + sha256 校验）；OSS 驱动预留抛 NotImplemented |
| 测试证据 | 静态门禁全绿：`npx pnpm@9.15.0 build`/`typecheck` exit 0，`verify:workspace` = `WORKSPACE_STRUCTURE_OK`；单测 14/14 过（database 4 + storage 10，vitest run 全 passed）；生产守卫演示 `NODE_ENV=production node packages/database/dist/migrate-cli.js reset-dev` exit 1，输出 `Refused: migrate command "reset-dev" is destructive and forbidden when NODE_ENV=production` |
| 集成测试 | 未在本机执行（需 Docker）；task-master 2.2 按 test-gate 纪律保持 pending，未置 done |

### Key Decisions / 坑
- 用户 2026-07-28 指示：本地机不做任何 Docker 相关执行，本地定位为架构设计 + 开发习惯优化；P1A-2 集成测试留待阿里云服务器就绪后在云上执行
- Prisma 仅前向迁移，回滚走每迁移附带的 rollback.sql 补偿路径（database-migration skill 第 2 条）
- 本机 `docker compose` 插件缺失，脚本 `docker compose ... || docker-compose ...` 兜底
- 开发凭据 compose 内联默认值为用户批准的开发态豁免；生产强制 env（2.9）

### ⏳ Next Steps
- [ ] P1A-2 集成测试（迁移 deploy/rollback/redeploy、redis ping、MinIO 全链路）：待阿里云就绪后在云上执行 `npx pnpm@9.15.0 test:integration`，通过后方可将 task-master 2.2 置 done
- [ ] P1A-3：邀请码注册与邮箱验证 Auth（task-master 2.3，先 design gate）

---

## 2026-07-28 — docs-sync 收尾并刷新 P1A-2 handoff

### ✅ Completed
| 任务 | 详情 |
|---|---|
| handoff 刷新 | `docs/handoff/2026-07-28-before-p1a-2-handoff.md` 已按 docs-sync 更新：补入 docs-sync skill 创建、handoff 入库规则、C 盘临时文件清理证据、当前 session skill 列表未刷新但文件可用的说明 |
| 规则确认 | 例行同步（project_index/progress/task-master/AGENTS/Memory）由 agent 主动完成；正式 handoff 在阶段边界/长 session/换 agent/换电脑/用户要求时写入 `docs/handoff/` |

### ⏳ Next Steps
- [ ] P1A-2：PostgreSQL + Redis + Storage Adapter（先 design gate）

---

## 2026-07-28 — handoff 入库到 docs/handoff

### ✅ Completed
| 任务 | 详情 |
|---|---|
| handoff 迁移 | P1A-2 前 handoff 已从 C 盘临时路径迁到项目内 `docs/handoff/2026-07-28-before-p1a-2-handoff.md`；临时文件已删除，后续 handoff 一律入库 |
| 规则更新 | `AGENTS.md` 文档分类新增 `docs/handoff/`；`.agents/skills/docs-sync/SKILL.md` 明确：例行同步 agent 主动做，正式 handoff 在阶段边界/换 agent/换电脑/用户要求时主动写，且必须存项目内 |

### ⏳ Next Steps
- [ ] P1A-2：PostgreSQL + Redis + Storage Adapter（先 design gate）

---

## 2026-07-28 — docs-sync skill + P1A-2 前 handoff

### ✅ Completed
| 任务 | 详情 |
|---|---|
| docs-sync skill | 新建 `.agents/skills/docs-sync/SKILL.md`：事实源顺序、必须同步时机、handoff 最小模板、不做的事（不手写 CLAUDE.md/不入密钥/不造第二份活文档）、自动化边界与 Red Flags；已登记 `AGENTS.md` 与 `project_index.md` |
| handoff | 已生成 P1A-2 前短 handoff：`C:/Users/Mac/AppData/Local/Temp/handoff-eM8h9E.md`；内容只指向事实源（AGENTS/Spec/ADR/audit/progress/index/task-master/Memory），不复制大段历史 |

### Key Decisions
- 文档管理采用“半自动”：agent 按 docs-sync 清单同步；`scripts/docs/check-docs-sync.mjs` 与 CI gate 后续再补，不用脚本替代人工判断
- `AGENTS.md` 仍是 canonical；`CLAUDE.md`/Cursor 规则不手写，确需多工具规则时再用 rulesync 并先写 ADR

### ⏳ Next Steps
- [ ] P1A-2：PostgreSQL + Redis + Storage Adapter（先 design gate，再实施 `infra/compose`、`packages/database`、`packages/storage`）

---

## 2026-07-28 — P1A-1 Monorepo 骨架落地并验证通过

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 执行方式 | 方案 A 全量占位骨架；`.worktrees/p1a-1` 隔离执行，subagent-driven：5 个 task 均有 implementer + reviewer，终审 clean |
| 骨架内容 | root `package.json`/`pnpm-workspace.yaml`/`pnpm-lock.yaml`/`tsconfig.base.json`/`eslint.config.cjs`/`.npmrc`；`scripts/verify-workspace.mjs`；`apps/{web,api,agent-worker,science-worker,sandbox-controller}`；`packages/` 11 个占位包；`infra/{compose,nginx,sandbox,scripts,migrations}` 占位 |
| 验证证据 | worktree 内 `node scripts/verify-workspace.mjs` = `WORKSPACE_STRUCTURE_OK`；`npx pnpm@9.15.0 install/build/typecheck/lint` 全过；API 冒烟 `API_IMPORT_OK`；复制净骨架回主目录后再次 `WORKSPACE_STRUCTURE_OK` |
| 收尾 | 净骨架已复制到主目录（排除 node_modules/dist/.next/tsbuildinfo/src 编译残留）；`.gitignore` 已补 `dist/`、`.next/`、`*.tsbuildinfo`；task-master `2.1` 置 done（JSON 修复路径，`JSON_OK`） |

### Key Decisions / 坑
- 实施中必要最小修复：`tsconfig.base.json` 的 rootDir/outDir 改用 TS 5.5 `${configDir}`；web 增加 Next 必需 `app/layout.tsx` 与 `rootDir: "."`；终审确认非 scope creep
- 按约束全程未 `git add/commit/push`；worktree 分支只有 untracked 骨架，因此采用“复制净骨架到主目录”收尾
- worktree 内曾产生 `src/*.{js,d.ts,js.map}` 编译残留；未复制到主目录。首次提交前仍需检查并清理/忽略类似残留（终审 Important 项）

### ⏳ Next Steps
- [ ] P1A-2：PostgreSQL + Redis + Storage Adapter（`infra/compose`、`packages/database`、`packages/storage`、迁移 runner）
- [ ] 首次 git 提交前：确认无 `src/*.{js,d.ts,js.map}` 编译残留、无 node_modules/dist/.next 入库

---

## 2026-07-28 — task-master tasks.json 子任务数据修复

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 备份 | 修复前创建 `.taskmaster/tasks/tasks.json.bak-20260728-parentid` 与 `.taskmaster/tasks/tasks.json.bak-20260728-subtask-ids` |
| parentId 修复 | 55 个子任务 `parentId: "undefined"` 已按父任务补齐，`JSON_OK` |
| 子任务 id 规范化 | 数值型子任务 id 统一转为字符串；发现并修复 `3.10/4.10` 被 JSON 数值吞零成 `3.1/4.1` 导致的重复 id；重复检查 `DUPLICATES []` |
| Phase 0 子任务状态 | 1.1–1.6、1.8、1.9 = done；1.7 = deferred（只读审计未运行测试/基准，避免 E2E 打生产）；任务 1 保持 done |

### Key Decisions / 坑
- task-master MCP `set_task_status` 对父任务可用，但对子任务持续报 `Failed to update task status`（修复 parentId/id 后仍复现）；本次按用户批准直接修 `tasks.json`，未动业务代码
- 后续用 task-master 扩子任务前，建议仍先跑一次小范围状态更新验证；若 MCP 子任务写入仍失败，继续以 JSON 校验 + 备份方式处理

### ⏳ Next Steps
- [ ] Phase 1A 首批：P1A-1 Monorepo 骨架 → P1A-2 PostgreSQL/Redis/Storage Adapter → P1A-3 邀请码注册/邮箱验证

---

## 2026-07-28 — Phase 0 门禁通过，ADR-001 Accepted

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 用户确认 | 用户接受 `docs/CODEBASE_AUDIT.md` 与 `docs/decisions/ADR-001-target-architecture.md` |
| ADR-001 | 状态已从 Draft 改为 Accepted（2026-07-28 用户确认）；`project_index.md` 同步更新 |
| task-master | Phase 0 任务 1 已由 review 转 done；Phase 0 正式完成，允许进入 Phase 1A |

### Key Decisions
- 目标架构确定为：选择性抽取 Scholars Tea 高价值模块，按 Baseline v1.0 重建 OpenScience Monorepo 平台底座
- Phase 1A 输入边界固定：只做平台底座，不含 SDF/编辑器（1B）、协作（1C）、Hermes/发布（1D）、可视化沙箱（1E）和 §19 Phase 2 功能

### ⏳ Next Steps
- [ ] Phase 1A 首批：P1A-1 Monorepo 骨架 → P1A-2 PostgreSQL/Redis/Storage Adapter → P1A-3 邀请码注册/邮箱验证
- [ ] 另立安全任务（需用户批准执行）：Scholars Tea 凭据轮换与 git 跟踪清理

---

## 2026-07-28 — Phase 0 Scholars Tea 只读审计完成（待确认）

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 审计执行 | 目标 `Z:/data/home/zju321/321/DHL/scholars_tea`（HEAD `74eb3f7`，工作区有大量未提交修改）；5 个并行只读子审计 + 高风险结论人工复核；未修改目标仓库、未读取 `.env`/`.env.postgres` 值、未启动服务/测试 |
| 产出 | `docs/CODEBASE_AUDIT.md`（目录/依赖/服务/数据地图，Hermes/AI/认证/上传/社区/WebSocket/模型路由定位，保留/局部重构/替换/待确认分类，风险登记册） |
| ADR-001 草案 | `docs/decisions/ADR-001-target-architecture.md`：选择性抽取 Scholars Tea，按 Baseline 重建 OpenScience 平台底座；AI Gateway 主模型 MiniMax-M3，回退配置化不写死 |
| task-master | 任务 1 已置 `review`，等待用户确认审计与 ADR-001 后进入 Phase 1A |

### Key Decisions / 风险
- Scholars Tea 可复用的是模块与经验，不是当前架构：认证/验证码流、service 层、统一 API 响应、`tool-call-guard`、RAG/引用校验/外部检索可抽取；上传、模型路由、socket 双写、迁移体系、部署脚本群必须重建
- 高危已核实：`.env.postgres`、`hermes-home/config.yaml`、`hermes/config.yaml`、`gateway_state.json`、`hermes-home/backup/*.bak` 被 git 跟踪；groups/upload 无鉴权；Prisma 空 baseline；SMS stub；E2E 直连生产地址
- pem 本地文件存在但本次 `git ls-files '*.pem'` 未确认跟踪；任何删除/清理都必须经用户批准

### ⏳ Next Steps
- [ ] 用户确认 `CODEBASE_AUDIT.md` 与 ADR-001；确认后 ADR-001 转 Accepted、任务 1 转 done
- [ ] 另立安全任务：Scholars Tea 凭据轮换与 git 跟踪清理（需用户批准后才执行）
- [ ] Phase 1A：展开 pnpm workspace/Auth/Workspace/RBAC/Prisma 基线迁移/Storage Adapter/CI 子任务

---

## 2026-07-28 — MiniMax-M3 基线修正 + ADR-002 工具可迁移性

### ✅ Completed
| 任务 | 详情 |
|---|---|
| MiniMax-M3 同步 | 用户确认首版主模型一直是 MiniMax-M3；已同步 baseline §2.4/§9.3/§24、MVP task design、architecture-guard skill、task-master tasks/drafts；回退策略不写死，交由 AI Gateway 配置/ADR |
| ADR-002 | 新建 `docs/decisions/ADR-002-agent-tooling-portability.md`：项目内安装、`npx`/`uvx` 优先、密钥不入库、生成物入库、不引入重叠任务事实源；代码审计/重构与文档自动维护工具分阶段候选 |
| AGENTS 规则 | 新增 Tooling Portability Rules，指向 ADR-002 |

### Key Decisions / 坑
- 回退/兜底模型未确认，任何文档/skill/task 不得写死；当前只确定主模型 MiniMax-M3
- 现阶段不安装新工具：`src/` 为空且无 root `package.json`；Phase 1A 初始化 pnpm workspace 时再把 markdownlint/dependency-cruiser/knip/jscpd/ast-grep/syncpack 纳入 devDependencies/scripts

### ⏳ Next Steps
- [ ] Phase 0：确认 Scholars Tea / AI Research Workshop 现有代码位置后执行只读审计（task-master 任务 1）
- [ ] Phase 1A：root `package.json`/pnpm workspace 建立后落地 `docs:lint`、`audit:*`、`docs:sync-check` scripts

---

## 2026-07-24 — T2 infra 脚本 + runbook 框架落地

### ✅ Completed
| 任务 | 详情 |
|---|---|
| infra 脚本框架 | 新建 `infra/scripts/{ssh-run,checkup,backup,deploy}.sh` + `infra/README.md` + `docs/runbooks/` 3 个四节骨架；已登记 project_index.md |
| T2 验证 | `bash -n infra/scripts/*.sh` 全过（SYNTAX_OK）；`backup.sh` 输出 NOT IMPLEMENTED 且 exit=64（符合预期）；`checkup.sh` 因本机 SSH 密钥未配置按设计报"请配置 SSH 密钥，本脚本不处理密码"（exit=255，属预期结果之一） |
| ssh-run.sh 修复 | 删除主机名后多余的 `--`（OpenSSH 会把它拼进远端命令导致远端 shell 报 invalid option） |

### Key Decisions / 坑
- .env 为 UTF-8，服务器键名为中文键 `公网ip`/`用户名`/`SSH端口`；脚本英文键（SERVER_*/SSH_*）优先 + 中文键兜底，刻意不读 `密码`/`Password`（BatchMode 仅密钥）
- 危险命令黑名单做单词边界匹配：`rm`/`systemctl stop` 无 --confirm 拦截（exit=65），`systemctl status`、`echo dormroom` 不误伤

### ⏳ Next Steps
- [ ] SSH 密钥配通后重跑 `checkup.sh`，把完整巡检输出记入本日志
- [ ] backup.sh / deploy.sh 及 3 个 runbook 内容待 Phase 1A（P1A-*）填充

---

## 2026-07-24 — task-master MiniMax parse-prd 实测通过

### ✅ Completed
| 任务 | 详情 |
|---|---|
| minimax_proxy 验证 | 代理 8471 端口链路正常：MiniMax-M2.7 响应正常，reasoning_split 生效（thinking 进 reasoning_content） |
| parse-prd 实测（CLI） | `task-master parse-prd .taskmaster/docs/prd.txt -o tasks-minimax-test.json -f` 成功生成 10 个任务（含依赖/优先级，结构合理）；Tokens 9969（in 2484 / out 7485） |
| .mcp.json key 修复 | OPENAI_COMPATIBLE_API_KEY 原为占位符 `${MINIMAX_API_KEY}`，进程环境无此变量 → MCP server 拿到空 key 报 401；已改为字面值（脚本写入未打印），**下次重启 session 后 MCP 路径生效** |

### Key Decisions / 坑
- `npx task-master-ai` 是 MCP server 不是 CLI；CLI 的 bin 名是 `task-master`（`npx --package=task-master-ai task-master ...`）
- parse-prd `-o` 输出文件必须预先存在（可先写空壳 `{"master":{"tasks":[]}}`）
- kimi-code 的 .mcp.json env 不做 .env 占位符解析（至少对未注入进程环境的变量如此），key 需写字面值

### ⏳ Next Steps
- [ ] 下次重启后验证 MCP 路径 parse-prd/expand（.mcp.json 字面值 key 生效）
- [ ] tasks-minimax-test.json 为测试产物，确认后由用户决定是否采用/清理

---

## 2026-07-24 — Memory 存储迁移 + git 推送打通

### ✅ Completed
| 任务 | 详情 |
|---|---|
| git push 打通 | 全权限 token（.env GITHUB_TOKEN_FULL_PERMISSION）推送 main 成功；原 GITHUB_TOKEN 确认为只读 |
| Memory 存储迁移 | .mcp.json 增加 MEMORY_FILE_PATH=.memory/memory.jsonl；重启 session 生效 |
| Memory 实体过滤 | 按用户要求只保留 3 个 XGS 实体（XGS项目环境配置 / task-master MiniMax 迁移 / XGS-Doc-Architecture）；其他项目 5 个实体留在原 npx 缓存存储，未动 |

### ⏳ Next Steps
- [ ] 重启 session 后验证 memory 从新路径加载（read_graph 应有 3 个 XGS 实体）

### Key Decisions
- server-memory 默认存储在包目录 dist/memory.jsonl（JSONL 格式）；迁移后随 git 备份
- git 推送方式：x-access-token + Basic extraHeader，token 按需从 .env grep 提取

---

## 2026-07-24 — 文档架构落地

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 文档架构设计 | spec 获用户批准：docs/specs/2026-07-24-doc-architecture-design.md |
| 规则三件套 | AGENTS.md / project_index.md / progress.md 建立 |
| 并行产物登记 | Cursor session 产出的 Baseline v1.0（docs/OpenScience_Kimi_Development_Spec.md）登记为 source of truth，路径例外原地保留 |
| 旧方案处置 | 方案0723.docx 已被 Baseline v1.0 取代，用户确认放弃，不归档 |
| git 初始化 | 关联 GitHub 远端，初始提交 |

### ⏳ Next Steps
- [ ] 按 Baseline v1.0 审计现有代码（Scholars Tea / AI Research Workshop 可复用模块）
- [ ] task-master MiniMax-M2.7 全链路实测（memory 遗留待办）
- [ ] 平台产品文件架构（SDF/RO 存储）细节在 Baseline 框架内细化
- [ ] 服务器文档规范待服务器上线后补入 AGENTS.md

### Key Decisions
- 文档管理分层落地：工作区先行，服务器预留，产品架构随 Baseline 细化
- 规则载体三重保障：AGENTS.md（强制）+ Memory MCP（跨会话）+ project_index.md（活索引）
- `docs/OpenScience_Kimi_Development_Spec.md` 为需求基线，路径例外不移动（多 session 引用）
- 放弃旧方案0723，避免新旧需求互相干扰

---
