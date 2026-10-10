# CURRENT Progress Window

动态任务、分工、版本和剩余交付统一见 [Hermes CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md)，本页只留最近检查点。

## 最近检查点
- 2026-10-10 09:47：修复+UI组合已推约定分支。新Linux恢复和发布脚本step、视频及两条期刊CI通过，media仍跑；四个浏览器用例暴露旧文案/未声明GET，UI优先修两原spec，settings WIP已保护暂停。生产窗口关闭，未重试发布；精确SHA/run/失败日志统一见CURRENT。
- 2026-10-10 08:57：本轮发布故障已收尾。原应用三主服务与原Native配对恢复健康，专用finalize经独立High、inspect0→confirm0清journal；部分依赖保留新构建，精确身份/证据统一见CURRENT。此次网站不可用约17分钟，新候选功能未上线，发布窗口关闭。
- 故障根因分别是实际Compose不支持create/start参数，以及installer把正式源码目录0775/模板0664误当私有权限异常；自动restore未写fixed files。专用恢复保留现场与旧备份、不重放任务、不改immutable；长期修复已分派视频与生图两个独立owner。
- 2026-10-10：修复前代码候选五条CI全绿，Linux发布组117/0skip、浏览器主组34/34闭合前次提交计数失败；这些证据没有覆盖上述真实发布缺口，不能宣称稳定交付。
- 生图下一批已将a6fa与新paired-query组合，原审源码/保护文件全等，原测试保留、组合query24PASS；root将收取并安排CI。实际Linux Host/SDK/PNG与三篇整体质量仍未验收。
- UI内容优先桌面、手机header及局部主CTA提前已组合，原High和实际浏览器fixture复用；root已看最终1440/390截图，完整图文与64px互动入口保留。下一步CI/真实站内验收，不以Figma或fixture代用户审美认可。
- 生图与视频先前idle主要等待总控集成发布，本轮已按实际缺口重新派发独立修复，UI持续开发；不靠重复诊断保持忙碌。完整分工和写权只在CURRENT。
- Fig2 exact5授权持续有效，仍0写/无writer；未知paid/oncekey/CP、真实论文、认可图和公开标识保护不变。BGE实际apply未做，crypto仍由用户暂停。
- 历史6f35事故迁移51保留；旧停机、CI失败、恢复及原reader失败证据均保留，不按历史next action再执行。

## 历史定位
- 本轮前状态与长证据见Git `d8a02e26a2ca5225c7977370584a7181fbc9a0b6:docs/handoff/2026-09-10-hermes-web-image-handoff.md`；更早在bebe897c/748e33a4。仅CURRENT维护执行状态，局部返工不取消原业务目标。
