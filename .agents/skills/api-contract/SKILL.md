---
name: api-contract
description: "Use when designing, adding, or changing any backend API endpoint, event, or frontend-backend data schema. Do NOT use for internal function signatures that never cross a process boundary."
---

# API Contract — API 合同规范

保证前后端、服务间接口符合 Spec §16 的统一形态，并有幂等、并发与合同测试保护。

## 何时使用 / 何时不使用

- **使用**：新增或修改 REST endpoint；新增领域事件；修改请求/响应 Schema；实现长任务（AI、上传、沙箱）接口。
- **不使用**：进程内私有函数、纯前端组件内部状态。

## 检查清单（Spec §16）

1. **模块化 REST/JSON**：API 以模块化 REST/JSON 为主，endpoint 归属 §16 的核心模块（`/auth`、`/workspaces`、`/research-objects`、`/sdf`、`/branches`、`/commits`、`/versions`、`/issues`、`/pull-requests`、`/reviews`、`/publications`、`/search`、`/agent`、`/sandbox-jobs`、`/usage`、`/admin`）。新模块需先说明为何现有模块装不下。
2. **长任务模式**：长任务不得同步阻塞响应；必须返回任务 ID，进度通过 SSE/WebSocket 推送（Spec §16、§9.3）。
3. **幂等键**：关键资源（发布、合并、支付/额度扣减类写操作）必须支持幂等键，重复提交不产生重复副作用（Spec §16）。
4. **乐观锁**：关键资源更新必须带乐观锁（版本号/etag），防止并发覆盖（Spec §16）。
5. **事件可重试、消费者幂等**：领域事件（如 `research_object.created`、`version.published`、`sandbox_job.completed` 等，见 §16 关键事件表）必须可重试；每个事件消费者必须幂等（Spec §16）。
6. **合同测试**：前后端共享 Schema 必须有合同测试覆盖；改 Schema 必须同步更新合同测试（Spec §21.1 测试层：合同测试 = 前后端 Schema）。
7. **权限检查在 API 层**：每个 endpoint 必须做 Workspace 级越权检查，禁止只在前端隐藏入口（Spec §3.3 角色表、§17 防跨 Workspace 越权）。

## 验收前自问

- 这个写操作重发一次会发生什么？（幂等）
- 两个请求同时改同一资源会发生什么？（乐观锁）
- 前端类型和后端 Schema 漂移时哪条测试会红？（合同测试）
- 这个 endpoint 归到 §16 哪个核心模块？越权检查在哪一行？
