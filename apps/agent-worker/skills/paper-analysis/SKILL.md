---
name: paper-analysis
description: Hermes 服务器论文理解工作流。用于真实论文高级解析、全文覆盖、跨章节综合、证据核验、物理审查和 SDF 建议；不用于普通问答。
version: 3
---

# Hermes Paper Analysis

该 Skill 必须由服务器任务处理器执行。仅存在本文件、依赖已安装或容器已启动，都不能报告能力已接通。

## 执行阶段

1. `inventory`：固定附件哈希、解析版本、页数、章节、图表、公式、补充材料和缺失项。
2. `advanced-parse`：优先使用 Docling CPU 版面解析；原生 PDF/Tesseract 只作回退或局部 OCR。
3. `coverage-plan`：按章节与语义单元建立全文阅读清单，不按六字段拆读。
4. `section-map`：有界并发读取正文、图注、表格与公式，保存 SourceMap 定位和跨段依赖。
5. `global-reduce`：跨章节重建问题、假设、方法链、结果、局限和复现信息；不同算例分别保存。
6. `evidence-check`：BGE/PaperQA 模式只用于召回、反查和冲突核验，不替代全文覆盖。
7. `science-review-packet`：冻结 PDF、SourceMap 与候选哈希，将六字段候选、去重直接证据、相邻限定、公式/图注和跨字段冲突索引打成一个 6–9k token 目标包；压缩不是截断上限。
8. `web-scientific-review`：网页 ChatGPT 6 Pro 独立复核完整六字段。MiniMax 不拥有最终科学放行权；网页不可用、回应漏审或错误引用时阻断，不回退 MiniMax 自审。
9. `targeted-evidence`：6 Pro 明确请求上下文时，只从现有 SourceMap 回读相关章节、相邻段、公式或图注，合并为最多一轮补证，不重解析全文。
10. `sdf-suggestion`：将已核对理解投影成六个待审字段，不直接写入正式 RO。
11. `user-review`：等待用户确认；科研内容、分镜、成图和发布各自确认。

用户明确“重新分析”时必须由当前生产解析器生成新的版本化 SourceMap；解析器升级后不得复用旧 SourceMap。旧产物保留审计，合同格式迁移且解析器未变时才允许复用。

## 失败语义

- 解析失败写“无法可靠读取”，补充材料缺失写“未取得”。只有覆盖完成且解析可靠后，才能写“所提供材料未报告”。
- 公式、版面或 OCR 错误只重跑对应页或区域。结构化输出错误只修结构并保留已验证内容。
- 单次容量不足时保存检查点并续读。不得截断科学条件，不得清空正确内容来通过合同。
- 同一根因连续两轮没有增加有效覆盖、修复关键公式、补全方法关系或得到正确结果，进入 `blocked_alignment` 并停止自动修补。
- `review_packet_ready → reviewing_web → review_received → awaiting_user_confirmation` 分开记录；补证为 `awaiting_review_evidence`，无法裁定为 `blocked_scientific_review`。网页回复收到、问题解决与用户确认是三个独立事实。

## 工具合同

- `build_science_review_packet`：绑定 PDF、SourceMap、候选和证据包哈希；区分原文、视觉转写和模型归纳。
- `submit_web_science_review`：同一 request/candidate/packet 只提交一次，立即固定 canonical；恢复只读同一对话，不重发。
- `read_review_evidence`：按明确问题从现有 SourceMap 定向回读，保存增补来源。
- `record_science_review`：保存完整回复、问题处置和修订差异；只形成待确认建议，无正式写入或发布权限。

## 来源

- Future-House/paper-qa（Apache-2.0，审阅 HEAD `57e89f7`）：证据检索、重排、上下文化综合、异步并发；图表可能被纯文本召回遗漏，因此不作为唯一覆盖层。
- K-Dense-AI/scientific-agent-skills（MIT，审阅 HEAD `9cf7d9a`）的 Paperclip/peer-review：有界 Map/Reduce、恢复与科学主张复核框架；不安装全库，不接入外部引用 ID。
- OpenDataLab MinerU Skill（审阅 HEAD `5733c03`）：作为未来解析器候选登记；它解决版面/公式抽取，不承担论文理解或科学放行。

细节见 `references/full-text-map-reduce.md`、`references/formula-and-physics-review.md` 与 `references/failure-and-recovery.md`。
