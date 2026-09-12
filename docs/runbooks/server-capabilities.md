# 服务器能力与复用清单

- CURRENT 2026-09-12：第1项文档与公式能力已部署，应用release76ead135、rollback5c655bea；关闭公式增强的旧release363257aa保留。仅补齐Docling已有镜像缺失的CodeFormulaV2权重，KaTeX与解析/理解指令已交付。实际结果见CURRENT handoff；后续写作与图片/视频风格按[能力台账](hermes-capability-registry.md)顺序推进。

- 本轮更新：服务器已实际登录用户指定的第二Chat账号（Pro），账户设置匹配；noVNC已恢复显示与操作，无需再次登录。不记录个人邮箱/凭据，不实现自动账号轮换。
- Chat6Pro已接收三张用户截图并完整回复：6aa3a4a4-f7a0-83ea-a0be-fc2f7eba4581。历史许可证400修复已经部署；当前正式工作台/公开阅读版本见本页CURRENT，不恢复旧候选结论。
- 画面恢复日志 jobs/x11vnc-login-recovery.log：曾无RFB greeting、后有端口占用；目前真实画面与交互正常，未证明XDamage或浏览器根因。无新安装。

2026-09-12 定向实时盘点。先查本页，再查相关条目的入口；能力或服务变动后同一任务内更新。文件存在、服务运行、产品调用成功是不同状态。本页记录部署位置与复用方式；Hermes语义能力/供应商政策见 [能力台账](hermes-capability-registry.md)，实时产品任务见 CURRENT handoff。

## 2026-09-12 文档与公式能力接入

- 后续实际观察更正：warnings=[]未发现4条坏公式，ScientificText实际28/32可渲染，第2/3页两个代表式已对照原页。候选向既有parser-image增加KaTeX0.16.47，格式失败回退orig并标confidence0；不改变网络/Secret/512MiB边界。候选尚未部署，不能按新增包已在生产运行记录。
- 缺失公式权重已下载到`/opt/openscience-models/docling-codeformula-v2/docling-project--CodeFormulaV2`；模型`docling-project/CodeFormulaV2`，revision`ecedbe111d15c2dc60bfd4a823cbe80127b58af4`，权重630993616字节，CDLA-Permissive-2.0，来源及revision留在父目录`SOURCE.json`和模型卡。复用已有Docling镜像与宿主代理，仅下载此模型配置/权重/tokenizer；未下载另一套OCR、浏览器或完整工具栈。
- 部署compose只读挂入既有模型缓存的同名子目录，不遮住镜像中的布局/表格/OCR模型。`HF_HUB_OFFLINE=1`，解析服务仍仅内网、无Secret；原2worker/3threads、6CPU/8GiB不变。document-parser启用`DOCLING_FORMULA_ENRICHMENT=true`。回滚应用363257aa的compose可恢复关闭状态，保留缓存无需删除。
- Docling识别公式写入TextItem.text；应用保留页码/bbox并补明确TeX分隔符。空识别/乱码保留原文并标low_confidence；高级解析失败的普通文本回退标partial_result/low_confidence。不会根据识别状态声称物理正确。
- Web复用锁文件已有KaTeX0.16.47，新增应用直接依赖及统一ScientificText；仅渲染明确公式、不信任HTML/链接命令，失败保留原文。研究理解skill v5经现有Worker真实导入，强调公式/单位/条件与来源核对、六字段保持凝练。
- 实际论文读取已完成：/parser-jobs/formula-reading-20260912.json，docling-serve-cpu1.30.0、26页、32公式、warnings=[]，没有普通解析回退。保留原公开内容；逐式正确性和新公式产品显示仍待对应原文观察，不由模型成功返回推断。

以下为开启前定向盘点，保留其判定依据：

- `paper-analysis`运行镜像`ghcr.io/docling-project/docling-serve-cpu:v1.30.0`，不是旧candidate；依赖元数据包含docling-core2.91.0、docling-ibm-models3.13.3、docling-parse7.10.0、RapidOCR3.9.2、torch2.13.0+cpu。这些是包存在证据，不表示每个模型都在每次任务中调用。
- `document-parser`实际`DOCLING_SERVE_URL=http://paper-analysis:5001`、`DOCLING_FORMULA_ENRICHMENT=false`、并发2；高级服务workers2、threads3。源码`ingestion-parser.ts`先走Docling异步PDF路径，保留JSON页码/bbox/公式标签；请求关闭Docling整页OCR，难读页交既有页质量/OCR路由。`detectLayout:false/grobid:false`控制另一路可选阶段，不能推断Docling未启用。
- Node轻量解析镜像通过mammoth/pdf-parse/yauzl和Tesseract解码；本次两个解析容器包元数据及产品源码未发现MarkItDown接入。宿主PATH未发现Pandoc/TeX/FFmpeg；已有媒体镜像可含FFmpeg，不能由宿主PATH缺失判全服务器未安装。
- 生产论文理解加载`apps/agent-worker/src/skills/paper-analysis.ts`和`research-understanding.ts`，由extractor显式导入；没有自动扫描`/opt/hermes-agent/skills`的产品通用加载器。宿主已有MIT `research/research-paper-writing/SKILL.md`（Orchestra Research、偏ML/AI稿件），属于文件可复用，尚非产品撰稿能力。
- 应用源码未发现KaTeX/MathJax/remark-math/rehype-katex统一数学渲染；现有`manuscript/paper.md`导出是六字段拼装，不是独立论文写作与精美排版产品。
- 本轮运行列表包含web/api/agent-worker/document-parser/paper-analysis/embedding-worker/scansci/browser及DB/Redis/对象存储/扫描/运维服务；旧dev/migration容器未出现在运行列表，不据此推断已删除。
- 开启前未触发解析；关闭公式增强是已确认缺口，不是所有乱码的已证实唯一根因。新模型实际运行结果以后续CURRENT记录为准。

## 历史产品回传（早于当前 release，保留复用依据）
- 最新产品任务fd719902已在原服务器会话成功生图100%并入库，旧3814f844限额不能代表新任务不可用；图片科学问题见CURRENT handoff。用户指定新Chat账号后已正常退出旧账号；随后已完成登录（见本页最新更新）。
- Google OAuth bridge补丁：仅在/opt/openscience-chatgpt-browser/scripts/host.mjs加入accounts.google.com与www.gstatic.com两个精确443域（日志与认证页脚本证明必需），Sol High复核通过；bridge重启active，浏览器/应用未重启。备份host.mjs.before-google-oauth-20260911。无Google通配符扩展、无新安装。
- production `f909c3a48a3c75e952735d8c71aeead393a404dc` / application rollback `8c2832f01136fd47a62fe6f4a4e5e07c2a994c63`；browser provider `f48324870f25b50c3a21eaad898beea87fb0aa1d` / provider rollback `48d9fa65db134575f53cf2a30724aa47a14eeea4`。
- 服务器必要构建/启动完成；连续工作台可打开，Hermes实际单字段共编、撤销、用户修订并确认v2已成功。无新增服务/安装；仍复用MiniMax/Gateway。
- 已部署默认分支提交后草稿同步、未改内容选择性保留审核和制作/发布两栏布局。v3实际保存刷新一致、5条已有材料可选。v2一次性状态恢复已审计：5 Claim/50 Evidence，原pending和改动problem保留，冻结记录未改。
- 旧v1两图8b0ca4c9与36a4已被标approved，但科学/视觉问题未消失，尚未发布；旧六图run仍failed。当前只要求一张合格核心图，不继续凑六场景。
- CDP与已授权服务器浏览器可用。截图先bringToFront；后台截图超时不代表网络或Chat不可用。Chat6Pro规划已收到，追加复核明确限流，未重试/换账号。
- 真实v3图片任务3814f844提交网页会话6aa3963b后明确rate limit；无新图，未发布。无新服务/安装。f909c3a4新增小屏两行header与三步导航，方案确认入口自动展开，服务器实际页面已观察。
- 高级paper-analysis/document-parser及BGE/ScanSci继续使用；无新OCR，视频暂停。用户已授权代为科学审核发布，不能放行已知错误。

## 使用规则
- 所有服务器相关任务先读本页相关条目。新增下载/安装前，依次查已有服务、镜像、共享缓存；优先原入口调用、复用镜像层或只读运行文件。
- 仅对缺失或与当前任务冲突的部分定向取证；安装前说明缺什么、为什么不能复用。不得仅因宿主 PATH 找不到就认定服务器未安装。
- 不复用生产登录态、Secret或可写数据卷，不改变已有服务。新增/升级/停用后原地更新本页和能力台账；不新增自动测试门禁。
- 不记录密码、key、Cookie、订阅文件内容。旧版本镜像存在不等于可删除。

## 已有位置与边界

| 能力 | 已有位置 / 入口 | 状态与复用方式 |
|---|---|---|
| 生产应用 | `/opt/openscience`；`openscience-prod-{web,api,agent-worker}-1` | application `76ead135…` / rollback `5c655bea…`；真实带图公开成果与剩余范围见CURRENT handoff |
| 主机资源 | ECS 16 CPU、30 GiB RAM、无 NVIDIA GPU | 盘点时约22 GiB可用；CPU解析器必须有界并发。Marker/MinerU等GPU高质量模式不能按GPU吞吐数据推断本机效果 |
| 完整图形 Chrome | 宿主 `/opt/openscience-tool-cache/playwright/chromium-1234/chrome-linux64/chrome`；ScanSci镜像内 `/opt/scansci-browsers/chromium-1234/chrome-linux64/chrome` | 已静态确认完整二进制。可复用现有镜像与配套资源；不是只存在 headless shell |
| 无头 Chromium | 宿主 `/root/.cache/ms-playwright/chromium_headless_shell-1234/` 与共享缓存同名目录；ScanSci镜像 `/opt/scansci-browsers/chromium_headless_shell-1234/` | 现成截图/渲染资源；不能用“仅此目录存在”的旧记录推断没有完整浏览器 |
| 浏览器运行依赖 / Xvfb | `openscience-scansci-mcp:7f8e47d931b751cc28c1000325128c2ca86566cb`；镜像 `/usr/bin/Xvfb` | 已有图形库与Xvfb；独立浏览器可派生镜像，不启动或修改生产ScanSci服务、不挂载其登录卷 |
| 网页远程桌面、生图与科学审阅 provider | `infra/chatgpt-browser/`；`/opt/openscience-chatgpt-browser` | bundle `d1630135…`；原生Create image与6Pro科学审阅分开，b19核心图已取回并在正式RO公开。复用原浏览器/登录、独立图片及科学审阅锁；人工恢复参与与边界见[浏览器手册](chatgpt-browser.md) |
| Node / Python | 宿主 `/usr/bin/node`、`/usr/bin/python3`；现有 `node:22-bookworm`、`python:3.12-slim` 镜像 | 已有；必要时复用镜像中的Node。不要默认全局安装 |
| 视频 / 字体 / FFmpeg | `openscience-media-demo:b361f4f7781b760583b3a312829877c4d6310e8a` 等已有media镜像；源码 `apps/media-demo/Dockerfile` | 镜像包含FFmpeg、CJK字体与无头浏览器；demo镜像可复用运行依赖，不代表Hermes完整视频产品链路通过 |
| 语音模型 | `/opt/openscience-models/qwen3-tts-customvoice-0c0e305`；`openscience/tts-audition:qwen0.1.1` | 目录与镜像存在，本轮未调用；不要重复下载模型，也不推断生产已接入 |
| PDF解析 / OCR | `openscience-prod-document-parser-1`、`openscience-prod-paper-analysis-1`；Docling Serve CPU v1.30.0及Node/Tesseract轻量链 | 76ead135公式增强true，真实26页/32公式输出已取得；具体选用阶段按任务来源判断，不由运行状态推断任意论文识别正确 |
| BGE-M3 | `openscience-prod-embedding-worker-1`；模型卷 `bge-m3-5617a9f61b028005a4858fdac845db406aefb181-08cc5a668e89` | 容器运行；既有模型卷复用。BGE生成向量，实际存储由现有检索/数据库链路负责 |
| ScanSci | `openscience-prod-scansci-mcp-1`；项目 `apps/scansci-mcp` | 容器运行；复用MCP取文献，不另装一份；认证状态不读取或打印 |
| Hermes / MiniMax | 生产agent-worker及AI Gateway；另有 `/opt/hermes-agent` 源码目录 | 源码目录存在不等于独立服务已启用；经现有Worker/Gateway调用，限额以实际供应商响应为准 |
| Codex订阅生图 | `/opt/openscience-codex`；独立runner bundle `1ad54c72` | 已有runner/预设skill；最新真实任务报usage limit，无新图。不得重新安装或重新登录当作额度恢复 |
| DB / 缓存 / 对象存储 / 文件扫描 | `openscience-prod-{postgres,redis,object-storage,malware-scanner}-1` | 本次列表显示运行；复用内部服务，不暴露公网，不读取环境变量凭据 |
| 历史非生产容器 | `openscience-dev-{postgres,redis}-1`；`xgs-hermes-migration-a72b5e1c` | 2026-09-12未在docker ps运行列表出现；停止/删除状态未另查。不得据旧条目称仍在运行，也不因名称直接删除 |
| 出网与访问 | 宿主Squid `127.0.0.1:7891`；项目SSH wrapper；Cloudflare Tunnel | 既有出网仍依赖本机上游（CURRENT研究记录）；远程浏览器界面仅SSH localhost6081。服务器驻留不等于出口已独立 |

## 本次取证与教训
- 读取Docker容器/镜像名称、定向文件路径、已安装包名及项目Dockerfile；没有运行测试、模型任务或读取Secret。
- 漏查 `/opt/openscience-tool-cache/playwright` 与ScanSci镜像，导致重复下载Chromium。已中止重复构建，改用已有完整浏览器与依赖。不要重复该路径判断错误。
- 本清单不是自动扫描脚本；只在相关能力发生变化时更新，避免每轮全盘扫描与重复消耗。

- 2026-09-10历史记录：用户接受现有本机出口；直接Chat会话接口与服务器网页执行分别判断，CUA失败不能推断Chat不可用。浏览器pids上限512。2026-09-11已授权代为审核发布；具体图片仍须核对，旧36a4存在指令外露、新8b的几何表达待确认，均未公开。
