# P1C-4 三类许可选择与继承规则 — Design Gate

- 日期：2026-08-04
- 任务：task-master 4.4（三类许可分别选择 + 继承校验底座）
- 依据：Spec §6.3、§2.2 决策 6、§5.3 manifest.licenses、§8.1 Fork 许可、§24 文案待确认
- 现状：LicenseAssignment 实体迁移 12 已建——本任务**无迁移**

---

## 需求基线

1. 发布前分别选择三类许可（§6.3）：
   - 文字：CC BY 4.0 / CC BY-NC 4.0 / All Rights Reserved
   - 代码：MIT / Apache-2.0 / GPL-3.0 / 不开源
   - 数据：CC0 / CC BY 4.0 / 自定义限制 / 不可下载
2. LicenseAssignment 记录 RO 级（versionId=null）与版本级（versionId≠null）许可
3. 许可变更不得追溯覆盖已公开版本（§6.3）——公开版本的 LicenseAssignment 只读，变更生成新记录仅对后续版本生效
4. 提供继承校验函数供 Fork/PR 调用（§8.1 Fork 必须继承并验证来源许可）
5. §24 待确认：代码中只使用标准许可证标识与名称，完整法律文案留配置位，禁止自行撰写写死

## 现状约束

- LicenseAssignment：`@@unique([roId, versionId, licenseType])`——每类每级唯一，天然幂等（upsert）
- versionId 可空：null = RO 级，非空 = 版本级（§6.3）
- Version 状态机（draft/published 等）：P1B-7 已建 status 字段，但发布状态机推进在 P1D-8——本期测试直接 DB 置 status
- PR 声明字段 dataLicense/codeLicense 已用标准标识（P1C-1 惯例）：`CC-BY-4.0`、`MIT`

## 架构决策（拟）

### 许可目录（标准标识 + 名称，§24 文案留配置）

```text
text: CC-BY-4.0 / CC-BY-NC-4.0 / ALL-RIGHTS-RESERVED
code: MIT / Apache-2.0 / GPL-3.0 / PROPRIETARY
data: CC0-1.0 / CC-BY-4.0 / CUSTOM / NO-DOWNLOAD
```

- domain 常量 `LICENSE_CATALOG`：{type → {id, name}[]}，仅标准标识 + 人读名称
- 完整法律文案：`packages/config` 占位 `LICENSE_LEGAL_TEXT_PLACEHOLDER`（注释标注 §24 待确认，禁止写死法律措辞）

### RO 级 vs 版本级语义

- **本期主路径：RO 级**（versionId=null）。`PUT /licenses` 三类型一次全量 upsert RO 级
- 版本级（versionId≠null）：API 支持对**未公开版本** upsert（P1D-8 发布事务将 RO 级快照落版本级）；对**已公开版本** upsert → 拒绝（§6.3 只读）
- 有效许可读取：`getEffectiveLicenses(roId, versionId?)` → 版本级存在则取版本级，否则 RO 级（§5.3 manifest.licenses 结构对齐）

### 已公开版本不可变（§6.3）

- domain 层强制：upsert 带 versionId 时查 version.status；`published` → 拒绝（VERSION_PUBLISHED）
- 数据层无额外约束（MVP 业务层足够；触发级在 P1D-8 发布事务再评估）

### 继承校验函数（Fork/PR 底座）

```ts
validateLicenseInheritance(source: {type, licenseId}[], target: {type, licenseId}[], direction)
→ { ok: boolean, violations: {type, source, target, reason}[] }
```

兼容矩阵（MVP，可扩展）：

| type | source | 允许 target |
|---|---|---|
| text | ALL-RIGHTS-RESERVED | 仅 ALL-RIGHTS-RESERVED |
| text | CC-BY-NC-4.0 | CC-BY-NC-4.0 / ALL-RIGHTS-RESERVED（可加严不可去 NC） |
| text | CC-BY-4.0 | 任意 text（可加严） |
| code | PROPRIETARY | 仅 PROPRIETARY |
| code | GPL-3.0 | GPL-3.0 / PROPRIETARY（copyleft 不可改宽松） |
| code | MIT / Apache-2.0 | 任意 code |
| data | NO-DOWNLOAD | 仅 NO-DOWNLOAD |
| data | CUSTOM | 仅 CUSTOM（条款未知不可推断） |
| data | CC-BY-4.0 | CC-BY-4.0 / CUSTOM / NO-DOWNLOAD |
| data | CC0-1.0 | 任意 data |

- P1C-5 Fork / P1C-6 PR 调用；本期提供函数 + 单测覆盖全矩阵

### API 形态

- 嵌套（与既有一致）：
  - `GET /research-objects/:id/licenses`（有效许可，含类型/标识/名称 + 是否版本级）
  - `PUT /research-objects/:id/licenses`（body: {text, code, data} 三标识；RO 级 upsert）
  - `GET /research-objects/:id/licenses/:versionId`（某版本有效许可）——P1D-8 公开页用，本期实现
- 幂等：`@@unique([roId, versionId, licenseType])` + upsert 天然幂等
- 乐观锁：许可非 RO.version 推进，无版本号；upsert 天然幂等

### 审计 + 审批登记

- 写操作 `license.upsert` 审计（§17）
- §9.4 R3：许可变化属高影响（需 P1D-4 统一 diff 审批）——本期直接落库 + 审计，R3 挂接在 P1D-4 实现时接入

---

## 5 Open Questions

| # | 问题 | 我的推荐 | 备选 |
|---|------|---------|------|
| Q1 | API 粒度？ | 单 `PUT /licenses` 全量三类型一次（发布前必须三类都选，§6.3）+ `GET /licenses` 有效值 | 每类型独立 PUT（3 请求，发布校验需聚合判断） |
| Q2 | 版本级许可本期范围？ | API 支持未公开版本 upsert；已公开拒绝（§6.3 只读）；P1D-8 发布事务把 RO 级快照落版本级 | 本期仅 RO 级，版本级 P1D-8 才建（不可变规则本期测不到） |
| Q3 | 已公开不可变 enforce 层？ | domain 业务层（upsert 查 version.status，published → 拒绝） | DB 触发器（重，MVP 过度） |
| Q4 | 继承校验矩阵范围？ | 三 type 兼容矩阵（上表）；`validateLicenseInheritance` 返回 violations[] | 仅同 licenseId 相等校验（太严，Fork 加严许可被拒） |
| Q5 | 许可文案处理？ | domain 仅 id + name（`LICENSE_CATALOG`）；法律文案 `packages/config` 占位注释 §24 待确认 | 文案写死 domain（违反任务 §24 禁令） |

---

## 测试策略

- **单测**（domain，mock prisma）：
  - LICENSE_CATALOG 三类枚举完整性（text 3 / code 4 / data 4）
  - upsert：RO 级全量、幂等重放
  - 已公开版本：versionId upsert published → 拒绝；draft 版本 → 允许
  - getEffectiveLicenses：版本级优先，无则 RO 级
  - 继承校验全矩阵：source CC-BY-NC → target CC-BY 拒绝；GPL → MIT 拒绝；MIT → GPL 允许等
- **集成测试**（云上，追加 collab.integration.test.ts）：
  - 许可选择：PUT 三类型 → GET 有效值 + 审计
  - 幂等：重复 PUT 同值 → 不重复记录
  - 已公开不可变：建 commit → 版本直接 DB 置 published → PUT 版本级 → 400
  - 版本级 draft 可设 + 覆盖 RO 级
- 既有 67/67 不回退

---

## 涉及模块

- `packages/domain/src/license/licenses.ts`（新）+ `errors.ts`（新）+ `catalog.ts`（新）
- `apps/api/src/routes/licenses.ts`（新）+ `app.ts` 注册
- `packages/domain/src/index.ts` 导出
- `apps/api/test/collab.integration.test.ts`（追加）
- `apps/api/test/helpers/fakes.ts`（licenseAssignment 假实现）
- `packages/config`：LICENSE_LEGAL_TEXT_PLACEHOLDER 占位
- 无迁移

## 交付物

1. 本 design gate 确认（5 决策）
2. plan 文档（TDD 步骤 + 兼容矩阵 + 不可变规则说明）
3. 代码 + 单测 + 集成测试
4. 本地门禁
5. 云上集成测试全绿
6. task-master 4.4 done + 文档同步
