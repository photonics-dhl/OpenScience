# P1E-8 沙箱威胁模型文档与逃逸基线测试 — Implementation Plan

**任务**: P1E-8 Sandbox Threat Model & Escape Baseline Tests  
**设计者**: Claude Opus 4.8  
**创建日期**: 2026-08-06  
**前置**: P1E-4 (Sandbox Controller), P1E-5 (Sandbox Jobs API), P1E-7 (Script Modification)  
**参考规格**: Spec §10.3, §17, §21.1, §23, §24

---

## 1. 任务目标

完成 Phase 1E 沙箱安全的最后一块拼图：

1. **威胁模型文档**：系统化梳理沙箱面临的攻击向量、现有防御措施、残留风险
2. **逃逸基线测试**：编写自动化测试用例尝试突破沙箱限制，建立安全基线
3. **安全文档**：为运维人员和用户提供沙箱安全承诺和责任限制说明

**验收标准** (Spec §21.1, §23, §24):
- ✅ 威胁模型文档覆盖至少 8 类攻击向量
- ✅ 基线测试至少 12 个用例，覆盖网络/资源/文件系统/容器逃逸
- ✅ 所有基线测试通过（攻击均被阻断）
- ✅ 文档包含法律免责声明和责任限制说明
- ✅ 生产前待办事项清单（独立 ECS、监控告警）

---

## 2. 现状盘点

### 2.1 已实现的安全措施 (P1E-4)

| 层级 | 措施 | 规格依据 |
|------|------|---------|
| **网络隔离** | `--network none` 完全禁止网络 | §10.3 |
| **资源限制** | 1 CPU / 1 GB 内存 / 64 进程 / 30s 超时 / 1 MB 输出 | §10.3 |
| **文件系统** | 只读根 FS + /tmp tmpfs (100MB, noexec) | §10.3 |
| **权限隔离** | 非 root 用户 (UID 1000) | §10.3 |
| **容器销毁** | 执行完成立即销毁，不复用 | §10.3 |
| **策略检查** | 简化版黑名单 (P1E-7) | §10.3 |

### 2.2 已有测试 (P1E-4)

`apps/science-worker/test/sandbox-security.test.ts` 包含 8 项测试：
- 网络隔离 3 项（公网/云元数据/内网）
- 资源限制 3 项（内存/输出/超时）
- 文件系统 2 项（只读根/tmp noexec）

### 2.3 缺失项

- ❌ 系统化威胁模型文档
- ❌ 容器逃逸尝试测试（特权提升、Docker socket 访问）
- ❌ 策略绕过测试（动态导入、混淆代码）
- ❌ 法律免责声明和安全承诺文案
- ❌ 生产前安全检查清单

---

## 3. 威胁模型结构

### 3.1 攻击向量分类 (STRIDE 模型)

| 分类 | 威胁 | 当前防御 | 残留风险 |
|------|------|---------|---------|
| **Spoofing** | 伪造身份访问其他用户数据 | RBAC + workspace 隔离 | 低 |
| **Tampering** | 修改系统文件 / Docker socket | 只读根 FS + 无 socket 挂载 | 低 |
| **Repudiation** | 不可否认性（审计日志） | Audit sink 记录所有作业 | 低 |
| **Information Disclosure** | 信息泄露（读取敏感文件） | 容器隔离 + 无敏感挂载 | 中（云元数据） |
| **Denial of Service** | 资源耗尽 / 恶意循环 | 配额 + 资源限制 + 30s 超时 | 中（多并发作业） |
| **Elevation of Privilege** | 容器逃逸 / 特权提升 | 非 root + no-new-privileges + capabilities drop | 中（Docker 漏洞） |

### 3.2 攻击场景详述

文档将详细描述以下场景：

1. **网络突破尝试**
   - DNS 隧道（已防御：无网络）
   - 时序侧信道（残留风险）
   
2. **容器逃逸**
   - Docker 0-day 利用（残留风险）
   - 文件系统竞态条件
   
3. **资源耗尽**
   - 并发作业 DoS（需独立 ECS）
   - 内存/CPU 饱和攻击（已防御：限额）
   
4. **策略绕过**
   - 动态导入混淆（当前简化版检测不到）
   - Python 语义级逃逸

5. **数据泄露**
   - 旁路攻击（Spectre/Meltdown）
   - 云元数据服务（已防御：无网络）

---

## 4. 逃逸基线测试扩展

### 4.1 新增测试用例

在现有 8 项基础上新增：

**容器逃逸组**（4 项）：
- Test 9: 尝试访问 Docker socket (`/var/run/docker.sock`)
- Test 10: 尝试特权提升 (`sudo`, `su`, `/proc/sys`)
- Test 11: 尝试修改容器 capabilities
- Test 12: 尝试创建设备节点 (`mknod`)

**策略绕过组**（4 项）：
- Test 13: 动态导入混淆 (`__import__('o' + 's')`)
- Test 14: Base64 编码导入
- Test 15: 字符串拼接绕过检测
- Test 16: 使用合法库的漏洞（如 `pickle` 反序列化）

### 4.2 测试文件结构

```
apps/science-worker/test/
  sandbox-security.test.ts       # 现有 8 项（保留）
  sandbox-escape.test.ts         # 新增 8 项逃逸测试
```

---

## 5. 文档交付物

### 5.1 威胁模型文档

**路径**: `docs/security/sandbox-threat-model.md`

**结构**：
1. Executive Summary（管理层摘要）
2. System Overview（沙箱架构图）
3. Threat Model（STRIDE 分类 + 8 类攻击向量）
4. Defense in Depth（多层防御措施）
5. Residual Risks（残留风险评估）
6. Mitigation Roadmap（风险缓解路线图）
7. Incident Response（事件响应流程）
8. References（规格依据 §10.3, §17, §21.1）

### 5.2 安全承诺与免责声明

**路径**: `docs/security/sandbox-security-statement.md`

**内容**：
- 沙箱安全承诺（网络隔离、资源限制、容器销毁）
- 用户责任（不上传恶意代码）
- 法律免责声明（逃逸责任限制）
- 安全报告流程（负责任披露）

### 5.3 生产前安全检查清单

**路径**: `docs/security/production-security-checklist.md`

**清单项**：
- [ ] 独立 ECS 部署（沙箱与数据库分离）
- [ ] 容器镜像安全扫描（Trivy / Clair）
- [ ] 沙箱作业监控告警（超时率 / 失败率 / 资源异常）
- [ ] 审计日志长期归档（180 天）
- [ ] 定期渗透测试（季度）
- [ ] Docker 版本跟进（CVE 监控）
- [ ] 法律团队审核免责声明

---

## 6. 实施步骤

### Step 1: 编写威胁模型文档（高优先级）

1. 创建 `docs/security/` 目录
2. 编写 `sandbox-threat-model.md`（~800 行）
   - 使用 Mermaid 绘制威胁树图
   - 详述 8 类攻击向量
   - 评估残留风险（高/中/低）
3. 编写 `sandbox-security-statement.md`（~200 行）
   - 法律免责声明（需用户法律团队审核）
   - 安全报告流程

### Step 2: 扩展基线测试（高优先级）

1. 创建 `apps/science-worker/test/sandbox-escape.test.ts`
2. 实现 8 个新测试用例（容器逃逸 4 + 策略绕过 4）
3. 运行测试验证所有攻击被阻断
4. 如发现防御漏洞，立即修复并更新威胁模型文档

### Step 3: 编写生产检查清单（中优先级）

1. 编写 `docs/security/production-security-checklist.md`
2. 列出 7+ 项生产前必做事项
3. 添加到 `docs/plans/` 中的 P1 最终检查清单

### Step 4: 文档审核与提交

1. 技术审核（确保威胁覆盖完整）
2. 法律审核（免责声明合规性）
3. Git 提交并推送

---

## 7. 测试策略

### 7.1 基线测试执行

```bash
cd apps/science-worker
pnpm test sandbox-escape.test.ts
pnpm test sandbox-security.test.ts
```

**预期结果**：所有 16 项测试通过（攻击均被阻断）

### 7.2 失败场景处理

如果某项测试失败（攻击未被阻断）：

1. **立即标记为高危漏洞**
2. 评估影响范围（用户数据泄露 / DoS / 权限提升）
3. 紧急修复（增强容器配置 / 策略检查）
4. 更新威胁模型文档
5. 重新运行所有测试

---

## 8. 风险与待办

### 8.1 已知残留风险

| 风险 | 严重程度 | 缓解措施 | 生产前必做 |
|------|---------|---------|----------|
| Docker 0-day 漏洞 | 高 | 跟进 CVE + 及时升级 | 监控订阅 |
| 沙箱与数据库同机 | 高 | Docker 网络分段 | 独立 ECS |
| 并发作业 DoS | 中 | 配额限流 | 独立 ECS + 监控 |
| 策略绕过（混淆） | 中 | P1E-3 AST 引擎 | P1E-3 实施 |
| 旁路攻击（Spectre） | 低 | 云厂商硬件防护 | 无 |

### 8.2 生产前待办（§23, §24）

1. **独立 ECS 迁移**（风险 5）：沙箱与数据库物理隔离
2. **容器镜像安全扫描**：Trivy / Clair 集成 CI
3. **监控告警**：沙箱作业失败率 > 10% 告警
4. **法律审核**：免责声明合规性确认
5. **定期渗透测试**：季度执行，聘请第三方

---

## 9. 验收标准

- ✅ `docs/security/sandbox-threat-model.md` 完整（8 类攻击向量 + 残留风险）
- ✅ `docs/security/sandbox-security-statement.md` 含法律免责声明
- ✅ `docs/security/production-security-checklist.md` 完整
- ✅ `apps/science-worker/test/sandbox-escape.test.ts` 新增 8 项测试
- ✅ 所有 16 项基线测试通过
- ✅ Git 提交并推送（commit message: `feat(sandbox): P1E-8 威胁模型文档与逃逸基线测试`）
- ✅ README 更新（添加安全文档链接）

---

## 10. 后续任务

- **P1E-3**: 完整 Python AST 策略检查引擎（替换简化版黑名单，缓解策略绕过风险）
- **P2 安全增强**: WAF 集成、沙箱镜像加固、内核安全模块（AppArmor/SELinux）
- **P2 监控**: Prometheus + Grafana 沙箱仪表板（失败率/超时率/资源使用）

---

**计划确认**: 本计划对齐 Spec §21.1 安全测试层、§23 风险跟踪、§24 待确认项。威胁模型文档为生产开放前必要交付物。
