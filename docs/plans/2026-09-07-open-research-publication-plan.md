# Open Research Publication：研究记录与 AI API 实施计划

> 依据：PRD v1.1；用户已授权实现、GitHub 推送与服务器部署。本轮完成 M1/M2 核心闭环；M3/M4 保持后续阶段，不声称整体 PRD 已完成。

## Global Constraints

- 保留既有 RO/SDF/Version/Claim/Evidence/权限模型与不可变历史；不回填用户确认，不自动发布私有研究。
- 确认必须原子绑定内容、PDF、可核查证据与固定版本；重复请求不产生重复版本，冲突不覆盖新内容。
- 未报告、缺失与待核查信息如实呈现；AI 推测不得成为已确认事实。
- UI、只读 API 和导出引用同一版本；所有读取/下载执行既有可见性与权限限制，不泄露私有存储路径或密钥。
- 中英文 UI；不重写无关页面、不改变 Hermes 形象。每项增加有意义回归测试。
- 生产仅经 canonical 运维脚本；部署前记录 rollback，部署精确 Git SHA，完成服务器构建、迁移状态和健康验收。

## Task 1: 导入确认成为真实研究版本

审计并修复 `packages/domain/src/ingestion/ingestion-service.ts`、既有 commit/version、Claim/Evidence 服务以及 API 契约。先写回归测试证明确认只改 SDF 的断点。

确认在一个事务中提交固定 Version，绑定已导入原始 Artifact、现有材料、SDF、能够从解析结果验证的 Claim/Evidence 和来源定位；复用既有提交与证据结构，不伪造页码/坐标/确认状态。原始结果缺少证据时显式保留待核查状态。保留既有作者信息，不把上传者当原作者。重复确认返回同一结果，版本冲突失败且没有半写入。必要迁移附回滚并更新迁移账本。

服务端提供 RO 的持久化导入材料/最近确认结果供普通编辑与 Files 页面恢复，不依赖 URL 参数。接口保持兼容或同步列出下游需修改契约。任务完成报告列出具体 API 返回字段和调用方式。

运行相关 domain/API 回归测试、构建和类型检查；提交仅此任务代码。不要改 PRD/索引/进度，控制器统一维护；不要 push/deploy。报告所有不能由原始解析结果可靠恢复的字段。

## Task 2: 页面一致性与来源核查

基于 Task 1 接口修复 Hermes 确认、编辑器与 Files 页面。普通入口/刷新后材料可恢复，确认后跳转真实版本；草稿修订号与快照版本号使用不同标签。附件添加不能意外丢弃既有 manifest。

在结论附近提供证据入口，复用已有来源查看器打开原文页码；没有定位时明确提示。呈现待核查/缺失信息，不要求为继续流程编造内容。Hermes failed 只表示实际任务失败；入口/权限/表单错误独立显示。保留既有 UI 风格和中英文。

新增行为回归测试并运行 Web 类型检查和相关测试；提交仅此任务代码。不要改共享文档，不 push/deploy。

## Task 3: 每 RO 的 AI 友好只读 API

复用既有服务提供固定版本的机器可读入口及 API 发现链接；使用现有路由风格，无需为示例路径重构。返回 schemaVersion、objectId、versionId、固定引用、SDF、Claim/Evidence、材料 manifest 和缺失状态，集合有确定顺序及明确分页/完整性说明。latest 解析固定版本；匿名仅公开已发布版本，登录用户仅有权访问版本，私有响应 no-store。不得把可变草稿伪装固定版本。

权限保护来源下载；不泄露 objectKey、内部存储 URL 或隐藏版本。GET 不调用模型、不写业务记录。公开契约文档含请求响应、权限、错误、固定版本引用与限量行为；UI 提供 API 链接。编写真实路由测试覆盖匿名/私有、固定版本稳定性、草稿隔离及缺失来源。

运行 API/domain 相关测试和类型检查；提交仅此任务代码。控制器维护文档索引与发布文档，不 push/deploy。

## Task 4: 发布与线上验收（控制器）

完成独立审查，运行全量 build/typecheck/lint/单测与文档门禁；记录任何环境限制。推送非强制版本到 GitHub，精确 SHA 部署并保留 rollback；canonical parser/runtime/migration/health 验收。用受控记录验证导入确认、材料一致性、API 权限和固定版本。更新 CURRENT handoff、索引和短进度，区分应用 SHA 与后续 docs SHA。
