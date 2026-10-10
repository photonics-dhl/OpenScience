# CURRENT Progress Window

动态任务、分工、版本和剩余交付统一见 [Hermes CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md)，本页只留最近检查点。

## 最近检查点
- 2026-10-10 12:19：本轮候选五条CI全绿，Linux Host六业务/图审/恢复/浏览器均已闭合；正式发布在公开精确版本验收后的retention旧schema处失败，已沿正常自动回退完整恢复原应用和Native，网站首页实际可读。新功能仍未上线，视频owner立即承接原retention两文件修复，原High增量审；UI继续独立编辑页，生图实际图片验收仍依赖发布。精确版本、回执和边界只见CURRENT。
- 2026-10-10 09:56：本批五CI终态为三成功/两media失败；Linux旧权限负控2/currentGreen39、发布与清单197全通过且原ZIP已保存。八个unique浏览器失败集中三spec：UI修原auth/workspace四例，video并行修创建入口四例，settings WIP保护暂停。生产窗口关闭、未重试；精确版本/run/原日志统一见CURRENT。
- 前轮三个spec全等集入；local dev手机脚本错误仍保留未定因，后续正常CI已闭合原断言。创建四例精确RO recovery GET补丁已收，本轮Linux主browser亦已通过；原失败保留，实际产品与模型质量仍独立验收。
- 2026-10-10 08:57：本轮发布故障已收尾。原应用三主服务与原Native配对恢复健康，专用finalize经独立High、inspect0→confirm0清journal；部分依赖保留新构建，精确身份/证据统一见CURRENT。此次网站不可用约17分钟，新候选功能未上线，发布窗口关闭。
- 故障根因分别是实际Compose不支持create/start参数，以及installer把正式源码目录0775/模板0664误当私有权限异常；自动restore未写fixed files。专用恢复保留现场与旧备份、不重放任务、不改immutable；长期修复已分派视频与生图两个独立owner。
- 2026-10-10：修复前代码候选五条CI全绿，Linux发布组117/0skip、浏览器主组34/34闭合前次提交计数失败；这些证据没有覆盖上述真实发布缺口，不能宣称稳定交付。
- 生图a6fa与paired-query、恢复修复cca8523+7ae3053和Host fixture均已集入并由本轮Linux闭合。实现/回执/精确集入只见CURRENT；installedSDK、真实PNG与三篇整体质量仍未验收。
- UI内容优先桌面、手机header及局部主CTA提前已组合，原High和实际浏览器fixture复用；root已看最终1440/390截图，完整图文与64px互动入口保留。下一步CI/真实站内验收，不以Figma或fixture代用户审美认可。
- 生图与视频先前idle主要等待总控集成发布，本轮已按实际缺口重新派发独立修复，UI持续开发；不靠重复诊断保持忙碌。完整分工和写权只在CURRENT。
- Fig2 exact5授权持续有效，仍0写/无writer；未知paid/oncekey/CP、真实论文、认可图和公开标识保护不变。BGE实际apply未做，crypto仍由用户暂停。
- 历史6f35事故迁移51保留；旧停机、CI失败、恢复及原reader失败证据均保留，不按历史next action再执行。

## 历史定位
- 本轮前状态与长证据见Git `d8a02e26a2ca5225c7977370584a7181fbc9a0b6:docs/handoff/2026-09-10-hermes-web-image-handoff.md`；更早在bebe897c/748e33a4。仅CURRENT维护执行状态，局部返工不取消原业务目标。
