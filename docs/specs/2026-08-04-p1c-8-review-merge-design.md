# P1C-8 Review 与 Merge 流程及高风险确认 — Design Gate

- 日期：2026-08-04
- 任务：task-master 4.8（逐项 Review + Merge + 高风险确认）
- 依据：Spec §8.2、§8.3、§3.3 角色、§3.4 作者、§4.2 可见性、§6.3 许可、§16 事件
- 现状：Review 实体迁移 12 已建（prId/reviewerId/verdict/items）——本任务**无迁移**

---

## 需求基线

1. Review 对 PR 逐项（按 SDF 字段/文件）给出意见与结论（§8.2）
2. 仅 Owner/Maintainer 可发起 Merge（§8.3 + §3.3 角色）
3. Merge 高风险确认：新增作者或改序（§3.4 getAuthorChangeInfo）、变更许可（P1C-4）、PR 声明改变方法/数据/核心结论（§8.2）、扩大可见性（§4.2）——命中任一必须显式确认
4. Merge 不修改历史公开版本；进入主分支后形成新草稿状态；发布需作者确认（§8.3，发布 P1D）
5. 冲突由人类选择/重新编辑，AI 不得静默决定（§8.3，不做自动冲突解决）
6. Merge 完成发出 pull_request.merged 事件（§16）
7. §21.2 步骤 12：原维护者 Review 和 Merge

## 现状约束

- Review：`prId/reviewerId/verdict(ReviewVerdict: approve/request_changes/comment)/body/items(Json)`；pr Cascade、reviewer Restrict
- PR status：open/merged/rejected；source/target branch
- getAuthorChangeInfo（P1C-7）：对比 Merge 前后作者/贡献者
- getEffectiveLicenses（P1C-4）：对比 Merge 前后许可
- RO 可见性：P1B-7 扩大需审批
- Notification：pull_request.opened 已有；merged 本期加

## 架构决策（拟）

### Review 创建（Q1）

- `createReview(deps, {prId, userId, verdict, body?, items?}, ctx)`：
  - PR 存在 + requireMembership（空间成员可 Review，§8.2 社区范围）
  - verdict 枚举校验 + items 数组（{path, kind, comment}）
  - create + 审计 review.create
- Review 只追加（§3.4 贡献语义，不可删）

### Merge 流程（Q2）

`mergePullRequest(deps, {prId, userId, confirmHighRisk: boolean}, ctx)`：

1. PR 存在 + 状态 open（非 open → 拒绝）
2. **Owner/Maintainer 校验**（§8.3）：requireMembership + membership.role ∈ {owner, maintainer}（viewer/contributor → 403）
3. **高风险判定**（四类）：
   - a. 新增作者/改序：PR.newContributors vs getAuthorChangeInfo（Merge 后作者 = 当前 authors + PR newContributors）→ 新增或改序 → highRisk
   - b. 变更许可：PR.dataLicense/codeLicense vs 源 RO 有效许可 → 不同 → highRisk
   - c. PR 声明 changesMethod/changesData/changesConclusion 任一 true → highRisk
   - d. 扩大可见性：RO.visibility 将扩大（Merge 不改可见性——**本期 Merge 不改变 RO visibility**，此条不适用；扩大走 P1B-7 审批）→ 登记说明
4. highRisk && !confirmHighRisk → HIGH_RISK_CONFIRMATION_REQUIRED（428 或 409 含 highRisk 详情）
5. Merge 执行：
   - source 分支 tip commit → target 分支（commit.branchId 改到 target）
   - PR status → merged
   - 新草稿版本：VersionManifest 用 source tip 的 manifest（新 versionNo = target 分支版本数+1，draft）
   - 作者：PR.newContributors 追加到 Author 表（全量替换 = 当前 authors + newContributors，顺序：现有 + 新增）
   - 许可：PR dataLicense/codeLicense 应用到 RO 级（validateLicenseInheritance 已过 P1C-6）
   - pull_request.merged Notification + 审计 merge.pull_request
6. 不做自动冲突解决（§8.3）：source/target 各自 tip 都保留，Merge 产生新 commit 指向 source tip（fast-forward 语义）

### 状态流转

- PR：open → merged（Merge 成功）→ 后续 rejected（reject PR 本期做？task 未明——**本期仅 merge**，reject 在 P1C-10 前端或延后）

### 事件

- pull_request.merged → Notification 行（Q5）

---

## 5 Open Questions

| # | 问题 | 我的推荐 | 备选 |
|---|------|---------|------|
| Q1 | Review 权限？ | 空间成员可 Review（§8.2 社区范围）；verdict 枚举 + items 校验 | 仅作者组（过严，社区评审是核心） |
| Q2 | Merge 执行语义？ | source tip commit 落到 target 分支（fast-forward）+ 新草稿版本 + PR merged + 作者合并 + 许可应用 | 目标分支不动只标 merged（「进入主分支形成新草稿」不满足） |
| Q3 | 高风险确认交互？ | 返回 409 + highRisk 原因列表；客户端确认后带 confirmHighRisk=true 重试 | 前端弹窗（后端仍需强制——本期后端强制，前端 P1C-10） |
| Q4 | 作者合并规则？ | Merge 后作者 = 当前 authors + PR.newContributors（去重，顺序现有+新增）；改序 = highRisk 预检 | 覆盖为 newContributors 仅（丢现有作者） |
| Q5 | 扩大可见性高风险？ | 本期 Merge 不改可见性（扩大走 P1B-7 审批），登记不适用 | Merge 可扩可见性（越权风险，且 P1B-7 重复） |

---

## 测试策略

- **单测**（domain，mock prisma）：
  - Merge 权限：viewer/contributor merge → 403；owner/maintainer 通过
  - 四类高风险触发：新增作者 / 变更许可 / changesMethod true / （扩大可见性不适用登记）
  - highRisk 无确认 → 拒绝；确认后 → 通过
  - 非 open PR merge → 拒绝
- **集成测试**（云上，追加 collab.integration.test.ts）：
  - Review→Merge 全流程：Review（approve）→ Merge（owner，confirmHighRisk）→ PR merged + target 分支新 commit + 新草稿版本 + pull_request.merged Notification
  - 历史公开版本不可变：published 版本 merge 后不变
  - 高风险无确认 → 409；越权 merge → 403
- 既有 79/79 不回退

---

## 涉及模块

- `packages/domain/src/review/reviews.ts`（新）+ `errors.ts`（新）
- `apps/api/src/routes/reviews.ts`（新）+ `app.ts` 注册
- `packages/domain/src/index.ts` 导出
- `apps/api/test/collab.integration.test.ts`（追加）
- `apps/api/test/helpers/fakes.ts`（review 假实现）
- 无迁移

## 交付物

1. 本 design gate 确认（5 决策）
2. plan 文档（TDD 步骤 + 高风险判定 + Merge 语义）
3. 代码 + 单测 + 集成测试
4. 本地门禁
5. 云上集成测试全绿
6. task-master 4.8 done + 文档同步
