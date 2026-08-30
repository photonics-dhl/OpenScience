# OpenScience Sandbox 生产安全检查清单

**版本**: 1.0  
**创建日期**: 2026-08-06  
**最后更新**: 2026-08-30
**状态**: Draft  
**依据**: Spec §10.3, §17, §21.1, §23, §24

---

## 使用说明

本检查清单用于确保沙箱环境在正式对外开放生产环境前，已完成所有必要的安全加固措施。

**检查时机**：
- ✅ 初次生产部署前（P0 必做项）
- ✅ 重大版本更新前
- ✅ 季度安全审查

**检查方式**：
- 技术团队：完成所有 P0/P1 技术项
- 安全团队：验证安全测试和配置
- 法律团队：审核免责声明和用户协议
- 管理层：批准风险接受和预算

## ScanSci 默认文献能力门禁（2026-08-30）

### 本地 Task 9：已关闭

- [x] source-lock 固定 ScanSci `1.11.0`、commit `7017814…b8e`、archive SHA-256 `db537914…9208b9`；Sci-Hub/LibGen/SciBban/Tor 仅允许 fixed false、拒绝逻辑和 adversarial test。
- [x] 唯一浏览器写入口为 `POST /literature/acquisitions`；generic `/agent/tasks` 不可提交 `source.retrieve`。入口具备 session、CSRF、10/min rate、AI Credit、幂等键、active membership、target scope 与事务审计。
- [x] legal service token 只读 file Secret；拒绝 inline env，使用 `O_NOFOLLOW` descriptor 并复验 regular/owner/group/`0400`/single-link/size/path identity。账号、Cookie、profile、token、object key 与 provider raw response 不进入 DTO、任务、数据库或日志。
- [x] upstream Requests 每跳发送前要求无凭据 HTTPS；每次实际 DNS 解析必须全部为 public address，拒绝 loopback/private/link-local/multicast/metadata/documentation/mixed answers 与非 HTTPS port。最终 URL/source/route 仍二次校验。
- [x] 4 KiB JSON、100 MiB PDF、PDF magic、60 秒子进程、2 个 service acquisition slot、1 CPU/1 GiB/64 PID/64 MiB tmpfs、bounded session snapshot 与稳定错误成立；stream read 异常已脱敏。
- [x] Compose/ADR 证明 legal/auth/Worker Secret 分权、session volume、auth loopback、data/app network 排除、pre-Worker verifier、exact previous/absent rollback 与 active+rollback image retention。
- [x] 静态门禁：forbidden-path 33 matches（全部 negative/fixed false/test）；Knip 0 unused；dependency-cruiser 831 modules/1936 dependencies、syncpack 无问题。
- [x] 本地门禁：build/typecheck/integration compilation/lint/test/docs lint/docs-sync/diff；完整 test `2105 pass / 20 platform skips / 0 fail`。Task 9 修复 commit `4f6361e`。

### 生产 Task 10：P0 阻断，尚未执行

- [ ] Exact CI、merged-main immutable build/deploy；core migration 33 与 PostgreSQL integration forward/rollback/redeploy/双连接合同。
- [ ] ECS Linux file-Secret metadata、DNS/HTTPS runtime、legal/auth image identity、non-root/read-only/limits/mount/network/port 与 targetless durable ScanSci task count = 0。
- [ ] 一次真实浙江大学 CARSI 登录、helper 移除、legal service recreate 后 session 仍 `ready`；账号/密码/Cookie 不出现在响应或日志。
- [ ] 真实 OA 与非 OA institutional PDF；四产品入口 375px；ClamAV/hash/rights；600s one-use/replay；真实 72h Worker GC 后 bytes absent、provenance retained；grey/Tor calls = 0。
- [ ] exact rollback/retention/hygiene；只清 acceptance identity，保留 session、active/rollback images、audit/rights/source provenance。未全部完成不得把 ScanSci 标为 `PRODUCTION` 或关闭 Task 10。

### Deferred Minor（不阻断当前单 Worker 本地候选）

- Task 1 lock coherence helper 按整个 lock 查 hash，而 `pip --require-hashes` 仍逐 requirement fail-closed；resolver-host header 只影响 provenance 文案。
- Task 2 Windows raw-socket reset 本轮多次相同 HTTP suite 未复现；Linux/Windows CI 仍需保留观察。
- Task 4 exited/created auth discovery 的单条测试仍是 source assertion；Task 10 ECS verifier/all-container discovery 是最终行为门禁。
- Task 8 有界 intent grammar/DOI 标点覆盖仍可能误路由，但不扩大权限、provider 或 Secret surface。
- 当前单 Worker 串行消费、service 2-slot/64-PID、API IP rate/credit 提供硬上界；若后续横向扩 Worker，需在扩容前加入共享 per-user/per-Workspace/per-publisher concurrency quota。

---

## P0: 生产前必做项（阻断发布）

### 1. 基础设施隔离

- [ ] **独立 ECS 部署** (§23 风险 5)
  - [ ] 沙箱 worker 与数据库不在同一物理机
  - [ ] Worker ECS 配置：4 CPU / 8 GB 内存（建议）
  - [ ] 网络隔离：sandbox_control_net 与 data_net 物理分离
  - [ ] 验证：从 worker 容器无法 ping 数据库内网 IP
  - **责任人**: DevOps  
  - **完成时间**: ___
  - **证据**: 架构图 + 网络测试截图

- [ ] **Docker 版本锁定与验证**
  - [ ] 生产环境 Docker 版本：`__.__.__`（填写经测试的稳定版本）
  - [ ] 验证无已知高危 CVE（Trivy / Clair 扫描）
  - [ ] 禁止自动更新，采用受控升级流程
  - **责任人**: DevOps  
  - **完成时间**: ___  
  - **证据**: `docker version` 输出 + CVE 扫描报告

### 2. 容器镜像安全

- [ ] **基础镜像安全扫描**
  - [ ] 使用 Trivy 扫描 `openscience-sandbox:latest`
  - [ ] 无 HIGH/CRITICAL CVE，或已评估可接受
  - [ ] 集成到 CI: 每次镜像构建自动扫描
  - **责任人**: Security  
  - **完成时间**: ___  
  - **证据**: Trivy 扫描报告（JSON 格式）

- [ ] **镜像最小化**
  - [ ] 移除不必要的系统工具（`wget`, `curl`, `gcc`, 等）
  - [ ] 仅保留 Python 3.11 + numpy + matplotlib + scipy
  - [ ] 镜像大小 < 500 MB
  - **责任人**: DevOps  
  - **完成时间**: ___  
  - **证据**: `docker images` 输出 + Dockerfile

### 3. 监控与告警

- [ ] **沙箱作业监控**
  - [ ] 失败率监控：> 10% 触发告警
  - [ ] 超时率监控：> 20% 触发告警
  - [ ] 平均执行时间：> 25s 触发预警（接近 30s 限制）
  - **工具**: Prometheus + Grafana / 阿里云云监控  
  - **责任人**: SRE  
  - **完成时间**: ___  
  - **证据**: Grafana dashboard 截图

- [ ] **Docker daemon 监控**
  - [ ] CPU 使用率 > 80% 告警
  - [ ] 内存使用率 > 80% 告警
  - [ ] 容器创建失败率 > 5% 告警
  - [ ] 磁盘空间 < 20% 告警（容器 overlay2 存储）
  - **工具**: node_exporter + Prometheus  
  - **责任人**: SRE  
  - **完成时间**: ___  
  - **证据**: Prometheus alerting rules YAML

- [ ] **审计日志监控**
  - [ ] 异常 API 调用模式检测（如大量 404）
  - [ ] 单 workspace 作业提交速率 > 100/小时 告警
  - [ ] 审计日志写入失败 > 1% 告警（数据完整性）
  - **工具**: ELK / 阿里云日志服务  
  - **责任人**: Security  
  - **完成时间**: ___  
  - **证据**: 日志查询规则 + 告警配置

### 4. 安全测试

- [ ] **基线安全测试通过**
  - [ ] 现有 8 项测试全部通过：`apps/science-worker/test/sandbox-security.test.ts`
  - [ ] 新增 8 项逃逸测试全部通过：`apps/science-worker/test/sandbox-escape.test.ts`（本任务）
  - [ ] CI 自动执行，生产部署前手动复验
  - **责任人**: Security + Dev  
  - **完成时间**: ___  
  - **证据**: Jest 测试报告（16/16 passed）

- [ ] **渗透测试**
  - [ ] 聘请第三方安全团队执行渗透测试
  - [ ] 测试范围：容器逃逸、越权访问、DoS、策略绕过
  - [ ] 所有 HIGH/CRITICAL 发现已修复
  - **责任人**: Security  
  - **完成时间**: ___  
  - **证据**: 渗透测试报告（PDF）

### 5. 法律与合规

- [ ] **免责声明法律审核**
  - [ ] 法律团队审核 [sandbox-security-statement.md](sandbox-security-statement.md)
  - [ ] 确认免责条款、责任限制、管辖法律合规
  - [ ] 整合到平台用户协议和服务条款
  - **责任人**: Legal  
  - **完成时间**: ___  
  - **证据**: 法律审核意见书

- [ ] **用户知情同意**
  - [ ] 用户首次提交沙箱作业时，显示安全承诺与免责声明
  - [ ] 用户需勾选 "我已阅读并同意安全声明" 才能提交
  - [ ] 记录用户同意时间到审计日志
  - **责任人**: Product + Dev  
  - **完成时间**: ___  
  - **证据**: UI 截图 + 审计日志示例

---

## P1: 短期改进（3 个月内）

### 6. 策略增强

- [ ] **P1E-3 AST 引擎**
  - [ ] 完整 Python AST 分析，替换简化版黑名单
  - [ ] 检测动态导入、字符串拼接、Base64 编码绕过
  - [ ] 集成到策略检查管线：POST /sandbox-jobs → AST 分析 → 入队
  - **责任人**: Dev  
  - **完成时间**: ___  
  - **证据**: 测试用例 + 代码 PR

- [ ] **并发数限制**
  - [ ] 单 workspace 最多 5 个并发容器
  - [ ] 超限返回 429 Too Many Requests + Retry-After 头
  - [ ] 优先级队列：付费用户 > 免费用户
  - **责任人**: Dev  
  - **完成时间**: ___  
  - **证据**: API 测试 + 配置文档

### 7. 事件响应

- [ ] **事件响应 Runbook**
  - [ ] 编写沙箱安全事件响应流程文档
  - [ ] 定义事件分级：P0（容器逃逸）/ P1（DoS）/ P2（越权）
  - [ ] 指定响应团队和 escalation 路径
  - **责任人**: Security + SRE  
  - **完成时间**: ___  
  - **证据**: Runbook 文档（Markdown）

- [ ] **事件响应演练**
  - [ ] 模拟容器逃逸场景，执行响应流程
  - [ ] 验证隔离、取证、修复、恢复步骤可执行
  - [ ] 记录演练结果，更新 Runbook
  - **责任人**: Security + SRE  
  - **完成时间**: ___  
  - **证据**: 演练报告（PDF）

### 8. CVE 监控

- [ ] **CVE 订阅与跟踪**
  - [ ] 订阅 Docker / runc / containerd / Linux kernel CVE 通知
  - [ ] 使用 GitHub Security Advisories / CVE Details / NVD
  - [ ] 每周检查新 CVE，评估影响并排期修复
  - **责任人**: Security  
  - **完成时间**: ___  
  - **证据**: 订阅确认邮件 + CVE 跟踪表格

- [ ] **紧急补丁流程**
  - [ ] 定义 HIGH/CRITICAL CVE 快速响应流程（24/48 小时）
  - [ ] 建立测试环境快速验证补丁
  - [ ] 预案：临时禁用沙箱功能 vs 紧急升级
  - **责任人**: DevOps + Security  
  - **完成时间**: ___  
  - **证据**: 补丁流程文档（Markdown）

---

## P2: 中期改进（6-12 个月）

### 9. 高级隔离

- [ ] **gVisor / Kata Containers 评估**
  - [ ] 评估 gVisor（用户态内核）性能和兼容性
  - [ ] 评估 Kata Containers（轻量虚拟机）资源开销
  - [ ] PoC 部署并运行基线测试
  - **责任人**: DevOps + Security  
  - **完成时间**: ___  
  - **证据**: PoC 测试报告

- [ ] **AppArmor / SELinux 加固**
  - [ ] 编写 AppArmor profile 限制容器行为
  - [ ] 测试 profile 不影响合法可视化脚本
  - [ ] 生产环境启用强制模式
  - **责任人**: Security + DevOps  
  - **完成时间**: ___  
  - **证据**: AppArmor profile 文件 + 测试报告

### 10. 日志与审计

- [ ] **外部日志归档**
  - [ ] 审计日志推送到 S3 / OSS，防止篡改
  - [ ] 180 天长期保存，符合合规要求
  - [ ] 配置不可变存储（WORM）
  - **责任人**: SRE + Security  
  - **完成时间**: ___  
  - **证据**: S3 bucket 配置 + 保留策略

- [ ] **日志签名**
  - [ ] 审计日志使用 HMAC-SHA256 签名
  - [ ] 密钥管理：HSM / KMS
  - [ ] 定期验证日志完整性
  - **责任人**: Security  
  - **完成时间**: ___  
  - **证据**: 签名验证脚本 + 密钥管理文档

### 11. 定期审查

- [ ] **季度渗透测试**
  - [ ] 每季度聘请第三方安全团队执行渗透测试
  - [ ] 测试最新攻击手法和 CVE 利用
  - [ ] 跟踪修复进度，下次测试复测
  - **责任人**: Security  
  - **完成时间**: 季度循环  
  - **证据**: 季度渗透测试报告

- [ ] **月度威胁模型更新**
  - [ ] 每月更新 [sandbox-threat-model.md](sandbox-threat-model.md)
  - [ ] 跟进最新 CVE、攻击案例、安全研究
  - [ ] 评估残留风险等级变化
  - **责任人**: Security  
  - **完成时间**: 月度循环  
  - **证据**: 更新后的威胁模型文档

- [ ] **年度安全审计**
  - [ ] 聘请外部审计师审查代码和基础设施
  - [ ] 审查范围：架构、代码、配置、日志、监控
  - [ ] 提供审计报告给管理层和合规团队
  - **责任人**: Security + Management  
  - **完成时间**: 年度  
  - **证据**: 审计报告（PDF）

---

## 检查清单使用记录

### 检查历史

| 日期 | 检查人 | P0 完成率 | P1 完成率 | 阻断项 | 签字 |
|------|-------|---------|---------|--------|------|
| 2026-08-__ | ___ | **/** | **/** | ___ | ___ |
| 2026-09-__ | ___ | **/** | **/** | ___ | ___ |

### 风险接受

如存在未完成的 P0 项或已知高危风险，需管理层签字接受：

**未完成 P0 项**：
- （列出项目编号和原因）

**接受原因**：
- （说明为何接受风险而不推迟发布）

**缓解措施**：
- （说明临时缓解措施）

**签字确认**：
- CTO 签字：＿＿＿＿＿＿ 日期：＿＿＿＿＿＿
- CISO 签字：＿＿＿＿＿＿ 日期：＿＿＿＿＿＿
- CEO 签字：＿＿＿＿＿＿ 日期：＿＿＿＿＿＿

---

## 附录：快速检查命令

### Docker 版本与 CVE

```bash
# 查看 Docker 版本
docker version

# 扫描镜像 CVE
trivy image openscience-sandbox:latest

# 查看运行中容器
docker ps --format "table {{.ID}}\t{{.Image}}\t{{.Status}}\t{{.Names}}"
```

### 网络隔离验证

```bash
# 从 worker 容器测试数据库连接（应失败）
docker exec <worker-container-id> ping -c 1 172.18.0.2

# 从沙箱容器测试公网连接（应失败）
docker run --rm --network none openscience-sandbox:latest ping -c 1 8.8.8.8
```

### 监控指标

```bash
# Docker daemon 状态
docker stats --no-stream

# 沙箱作业统计（需查询数据库）
psql -c "SELECT status, COUNT(*) FROM sandbox_jobs WHERE created_at > NOW() - INTERVAL '1 day' GROUP BY status;"

# 审计日志统计
psql -c "SELECT action, COUNT(*) FROM audit_events WHERE action LIKE 'sandbox.%' AND created_at > NOW() - INTERVAL '1 day' GROUP BY action;"
```

---

## 参考文档

- [Sandbox Threat Model](sandbox-threat-model.md) - 威胁分析和残留风险
- [Sandbox Security Statement](sandbox-security-statement.md) - 安全承诺与免责声明
- [P1E-4 Design](../specs/2026-08-06-p1e-4-sandbox-controller-design.md) - 沙箱控制器设计
- [Spec §10.3](../specs/) - 沙箱全部限制
- [Spec §17](../specs/) - 安全与隐私 MUST
- [Spec §23](../specs/) - 风险跟踪

---

**版本控制**：本检查清单随项目演进持续更新。重大变更需通知安全团队和管理层。
