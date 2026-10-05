# CURRENT Progress Window

原生Hermes＋M3忠实理解论文、自校转述及自动私有分镜，用户最新Synclip接口授权和未完成验收，统一见[Hermes CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md)。本页不另维护接口或发布状态。

## 本轮检查点
- 2026-10-05新真实验证`native-tools-preimage-20261005-cds-3`：run `b85e53f7-64c6-4816-b8a7-ffff443fbf32`。原生Hermes已成功完成SourceMap、paper-author六维/Claims、独立`paper-source-review`，随后进入`presentation.generate`；首次科学分镜拒收使用了真实调用ID并正确进入repair，但第二次反馈后的模型输出超过单回合上限，按安全策略终止（`output truncated; no automatic paid correction`），无图片、无Synclip调用，旧失败任务未重放。最小修复收紧repair协议为下一条消息只能是一次`paper_illustration_science_repair`调用，禁止解释、整份science或art重述；定向327/327、Worker typecheck、两文件scoped ESLint通过，待CI与应用发布后再做下一次真实验收。
- 已按用户要求检索Skills市场与Hermes官方目录：现有`baoyu-infographic`、OpenScience科学插画、`pdf`与证据绑定模式已覆盖当前任务；高安装量的`paper-context-resolver`不适合整篇论文理解，低可信第三方材料图包仅作为contract→storyboard gate参考，未安装。当前修复继续收敛科学分镜的有界场景修复，不改来源守卫。
- 原生分镜修复增量已提交`dc1f70b46aa7c0bd15ec2e37afef6ed56ba2dde2`并随应用release`d06b7a6a6344ed23d6ee3ecee9d7beca11272e30`发布，rollback为`99fb1f67ccdfa6e5dec51cacc1f56e05967f95d3`：新任务的`invalid_illustration`反馈现在携带真实拒收science工具调用ID，Hermes必须原样用于单场景修复；旧保存会话依据首轮工具描述逐字回放，不追加字段。CI37265790927通过；分镜/自动风格/原生图解326项定向测试、Worker typecheck、scoped ESLint通过。全Worker套件仍有90项既有parser/extractor/presentation fake与Windows权限基线失败，未命中本改动。此前真实run `02b9b621-1f8b-4e9b-8ee6-2e6162e85fe0`已完成上传、SourceMap、源审校和科学计划，随后因Hermes伪造修复ID并重复整份science而blocked；无图片、无Synclip调用，收据禁止重放。部署使用`--no-tests --skip-migrate`，Parser/ScanSci/embedding/auth功能探针未执行。
- 新独立Native核源真实完成但原文保真仍NO-GO，自动私有分镜在原预算内自然失败；0图片，四份公开冻结内容完整全等、原作者不变，Native实例归零并释放协调窗口。本地修复实际检索漏段与冗余空引用占位：459定向、2真实Map/paid零外呼、Worker TC/scopedlint通过；两项最终独立Code/Ops High GO，精确75步CI、正常发布及后验均通过；原生Hermes/资源限制/生图hold保持。随后一次正常私有自动前置验证已完成源审校与科学计划，但在分镜修复ID契约处blocked；无图片、无Synclip调用，旧once收据均未重开。工具修复不等于内容合格；首张Synclip试图继续等待科学与完整prompt验收。
- 默认来源Skill补接已发布，Source独立v6/旧方法不变，16定向、TC/build/lint、High及精确CI通过，实际目录/任务消费新方法。新source4m45s完成，主机制和99as例基本忠实，辅助范围/绑定仍NO-GO。复用已有独立Hermes核源候选已实现并获Code High GO：新max9原子初始化真实reviewer；即时上传先等作者完成，再填同一审阅阶段，旧分类/paid/replay不改。Domain242定向通过，实际上传顺序→Claims→Native私有分镜→现有生图hold有离线编排证据；最终TC/build/scopedlint、精确75步CI及正常app-only发布通过，保留Native配对。现有作者的独立核源一次已运行，原稿及公开冻结记录保持；真实科学效果仍待验收。实际Native图像能力false，允许核源成功后的私有分镜并沿原机制暂停生图；身份、证据和完整剩余链路只见CURRENT。
- 最新原文直写去掉坏父稿输入，技术完成且实际读源/看页，但终稿仍有量关系/对象/条件/范围失真，原文保真NO-GO；没有接分镜或图片。父稿锚定并非唯一原因，完整真实稿和paid已保留；旧失败任务不重开。
- 已复现五次8000字符超限却收到generic错误的机械循环。已部署增量在新fresh描述下给精确总长，补用已装读者组织方法，减少辅助公式/算例，中文自然语言说明；原大小边界和科学/权限守卫保持。242定向及真实完整回执零外呼回放通过，Worker TC/build/scopedlint0；最终Code High及Native复用/一次source-only Ops GO；精确CI全部通过并正常发布，新同源source-only写稿2m27s技术完成、中文及方法确实送达，但几何/条件方向/范围/跨案例仍保真NO-GO，没有run或图；当前核默认SourceSkill的已装证据对齐方法消费缺口，不据工程检查解除NO-GO。
- 台账当前入口压缩为目的、实际消费、效果和缺口；旧阶段方法/失败原地移入历史段，避免旧next action干扰。历史执行窗口保存在Git d94870e3的同文件；具体运行、一次性提交保护、未完成三篇/用户旅程/生图后半链和cleanup归属只见CURRENT。

## 用户目标与其余交付

- 原生Hermes科学正确、凝练、自动计划、完整prompt和风格适配须真实产物验收；少操作创建与布局体验、三篇论文整体验收仍有效。新的生成方式接入后继续像素审核与现有公开流程，不批量冷启动。
- UI质感已合入并正式发布，实际官网指南、桌面、编辑、账户与公开阅读路径已观察；手机单Live2D展开/关闭/焦点返回和字体激活通过。10页公司Word与新固定脱敏ZIP已完成全页排版/凭据/归档复核；全部角色、低频表单、长期性能及最终用户审美认可继续保留。运行身份和证据仅见CURRENT与[公司交接](handoff/2026-09-30-vendor-evaluation.md)。
- 视频画面认可不等于旁白或论文成片认可；原片、402任务边界、Qwen与marker保留，独立视频会话继续。期刊真实试用及权限/版权见[期刊CURRENT](handoff/2026-09-15-journal-onboarding-handoff.md)。

## 历史与定位

- 详细执行过程按Git历史及[能力台账](runbooks/hermes-capability-registry.md)定向读取；本页不再保留旧“候选待CI/未激活/下一步”段落。工程通过、已部署、实际消费和科学质量分别判断。
- 文件入口见project_index.md。研发观察台是人工快照，不是自动遥测；CURRENT保存唯一动态交付表，未完成需求不能因历史文档压缩而消失。
