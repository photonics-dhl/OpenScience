---
name: paper-analysis
description: Hermes 服务器论文理解工作流。用于真实论文高级解析、全文覆盖、跨章节综合、证据核验、物理审查和 SDF 建议；不用于普通问答。
version: 2
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
7. `physics-review`：独立对照已选原文，核对量纲、数量级、适用条件、物理量身份、关系符及理论/模拟/实验身份；检查主峰/旁瓣、局域/入射、单粒子/束流、结构尺寸/场宽等限定是否被摘要吞掉，并纠正结果、方法、洞见与复现信息错位。
8. `sdf-suggestion`：将已核对理解投影成六个待审字段，不直接写入正式 RO。
9. `user-review`：等待用户确认；科研内容、分镜、成图和发布各自确认。

用户明确“重新分析”时必须由当前生产解析器生成新的版本化 SourceMap；解析器升级后不得复用旧 SourceMap。旧产物保留审计，合同格式迁移且解析器未变时才允许复用。

## 失败语义

- 解析失败写“无法可靠读取”，补充材料缺失写“未取得”。只有覆盖完成且解析可靠后，才能写“所提供材料未报告”。
- 公式、版面或 OCR 错误只重跑对应页或区域。结构化输出错误只修结构并保留已验证内容。
- 单次容量不足时保存检查点并续读。不得截断科学条件，不得清空正确内容来通过合同。
- 同一根因连续两轮没有增加有效覆盖、修复关键公式、补全方法关系或得到正确结果，进入 `blocked_alignment` 并停止自动修补。

## 来源

- Future-House/paper-qa（Apache-2.0）：证据检索与上下文化综合模式。
- K-Dense-AI/claude-scientific-skills `paperclip`：有界 Map/Reduce 与恢复模式，不接入其外部运行时或引用 ID。
- K-Dense-AI/claude-scientific-skills `peer-review`：科学主张复核框架，不将其当作 PDF 解析器。
