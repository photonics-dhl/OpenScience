---
name: repo-map
description: Produce an evidence-backed read-only directory, dependency, service or data map for repository discovery or audit.
---

# Repo Map — 只读代码库地图

从适用说明、branch/HEAD/status、manifest 和 tracked files 开始。文档先定向查 `project_index.md` 与 CURRENT handoff，再按文件名和内容搜索；不要根据旧阶段文档推断当前任务。

限定需要回答的模块、依赖、服务或数据路径，用 `rg --files`、`rg` 或 `git grep` 搜索。排除依赖、构建产物、缓存、二进制和数据集，除非它们正是问题对象。不要全量递归读取。

严格只读：不修改、移动、删除文件，不安装依赖，不自动产出审计文件。不读取或打印 `.env`；环境变量键只从模板或代码声明收集。

每项结构结论附文件路径或运行证据，区分已证实、推断和待确认。按问题提供目录职责、依赖方向、服务/端口/存储对应关系或数据流；完整审计可附保留、局部重构、替换、待确认建议及安全、重复实现、失效功能和迁移风险。

默认在回复中交付地图。用户另行要求持久化时，交接给文档编辑流程并遵守当前索引与分类规范；本技能不强制创建旧 Phase 0 文件，也不要求重新进入 Phase 1A。
