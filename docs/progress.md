# OpenScience 进度（CURRENT window）

> 最新同步：2026-09-06 +08。应用/public080fa74eecebd25ad63b48c8dd968d7b66d00cc7，rollback75797389fa7afa096599597841b66630f8b82ac4；分支codex/overview-responsive-companion，后续文档/测试提交HEAD以Git为准。demo9848411、Codex controller3d518af独立不变。

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
