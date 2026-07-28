---
name: test-gate
description: "Use after any code change before claiming completion, and when preparing phase acceptance evidence. Do NOT use to design new test frameworks — this is a pass/fail gate, not a test-authoring guide."
---

# Test Gate — 测试门禁

改完代码到声称完成之间的强制关卡。核心原则：先最小相关测试，再阶段验收；证据先于结论。

## 何时使用 / 何时不使用

- **使用**：任何代码修改完成后；阶段（Phase）验收前；准备 PR 合并前。
- **不使用**：设计测试框架选型；纯文档修改（但仍需核对链接/索引有效）。

## 检查清单

1. **先最小相关测试**：修改后先运行与改动直接相关的最小测试集，确认通过（Spec §20.1-6）。
2. **再阶段验收测试**：最小测试过后，运行当前阶段的验收测试（Spec §20.1-6）。
3. **禁隐藏失败**：不得隐藏失败测试、跳过迁移检查或声称未验证的功能已完成（Spec §20.1-7）。测试红着就不许说"完成"。
4. **验收证据对应测试层**：声称某能力完成时，证据必须对应 §21.1 的测试层：
   - 单元测试：领域规则、权限、diff、ID、配额；
   - 集成测试：数据库、存储、队列、AI Gateway；
   - 合同测试：前后端 Schema；
   - E2E：注册、创建、编辑、审核、发布、Fork、PR、Merge；
   - 安全测试：越权、上传、SSRF、Prompt Injection、Sandbox Escape 基线；
   - 恢复测试：数据库恢复、对象存储校验、任务重试；
   - 性能测试：公开页、搜索、上传、队列并发。
5. **Goal 带验证证据**：每个阶段使用明确 Goal，说明完成条件和验证证据（Spec §20.1-3）；报告完成时附实际运行的命令和输出摘要。
6. **MVP 主流程可通**：涉及主流程的改动，对照 §21.2 的 16 步验收主流程确认未破坏（注册→创建 RO→SDF 提取→审核→Commit→发布审核→许可证→发布 v1→公开页→Fork/PR→Review/Merge→v2→diff→沙箱可视化）。

## 红线复述

- "我还没跑测试但应该没问题" = 未完成；
- 跳过的测试必须显式说明原因并记录在案；
- 验证命令的退出码和关键输出必须真实引用，不得凭印象描述。
