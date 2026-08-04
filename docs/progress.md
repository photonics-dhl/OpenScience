# OpenScience (XGS) 进度日志

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
