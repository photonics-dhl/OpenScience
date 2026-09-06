# Progress

## 2026-09-06 screenshot correction in progress

- 用户否定旧版视觉与Hermes渲染，要求快部署少重复测试。69aac51已正式部署，rollback080fa74，公网桌面/手机8场景通过、会话退出。branch codex/overview-responsive-companion；公网发现媒体页浮动Hermes遮挡素材，正在补专属companion栏。
- 黑块由销毁实例时误销毁Pixi共享纹理，真实Chromium精确红绿复现；原角色静态fallback保留。相关19单测通过。
- RO shell/nav、空概览起步、编辑与无版本媒体流程已上线；已有分镜默认折叠，2条原修订/生图fixture先展开后通过。专属媒体companion补丁待发布，不能把69视为视觉收尾。

## Research desk / overview / contextual Hermes deployed

- PR1037579738和PR104080fa74均合并部署。真实桌面采用灰白/深青；无待办续接打开概览，有待审核任务继续准确续接。保留原神狗/神灯、现有Drawer、权限及轮询。
- 概览完整显示SDF叙述，段落上下文经trusted target传入Worker模型；最新已提交版本approved媒体独立加载/重试、原始证据分开。RO.version不是Version.versionNo，asset.label不是人类标题。
- 公网验收发现1024侧栏容不下360px Wanko，已修复为中屏双栏/宽屏220px目录+正文+400px助手；未缩小角色。英文目录裁切也已修复。红测试1024/1280后，最终8项浏览器回归与非空目录标签检查通过。
- 最终CI34034878269全绿：build/typecheck/lint/unit、产品110、Hermes19+8。服务器全量build、parser16、核心36/search2迁移状态、BGE/ScanSci/runtime/health/retention通过，无待执行迁移和部署事务。
- 最终公网中英1440/1024/390，共12个桌面/概览场景通过；无横溢出，神狗ready，助手可打开；0业务写入，受控会话已退出。首轮networkidle超时，最终按DOM+实际控件就绪验收通过。
- 配置纠错：release config包含新测试，但package脚本显式文件列表此前未包含它；收尾修正默认命令，真实命令定向5/5通过。此为测试/文档提交，不是新生产版本。后续CI仍需以具体SHA判定。
- 线上受控RO最新提交版无approved媒体，空状态正确；媒体过滤/重试由fixture验证，不冒充新论文或生图验收。本轮无新AI任务/额度消耗，无新模型安装。
- 证据：apps/web/test/visual/out/research-journey/overview-patch-{ci,prebuild,deploy-retry,checkup,public-final}.log、release-public-evidence.json与public截图。CURRENT handoff含精确版本/约束。

## Next

- 继续已确认主线的其他页面布局/交互与真实论文完整旅程验收；本轮桌面/概览/段落Hermes已完成，整站与自动多模态生产链尚未全部完成。
- 保留连续Serena v4配音、已修复animated D2NN演示、Chromium/FFmpeg/PyTorch/Qwen/Codex运行时；CPU图像安装仍USER-PAUSED。
- PDF方法/结果/可复现性提取及Evidence/SourceMap仍有既知缺口；生成解释图不等于原始证据。后续改进复用能力基座，质量与成本并重。
