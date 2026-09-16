# OpenScience

开放科学研究成果发布平台

## 开发入口

先读 [项目规则](AGENTS.md) 与 [CURRENT handoff](docs/handoff/2026-09-10-hermes-web-image-handoff.md)，再按 [文件索引](project_index.md) 定向查代码。需求查 [基线](docs/OpenScience_Kimi_Development_Spec.md)，已有实现/真实效果查 [能力台账](docs/runbooks/hermes-capability-registry.md)，服务器操作查 [能力清单](docs/runbooks/server-capabilities.md)。旧计划、交接和验收记录保留为历史，不作为当前待办。

内部 Langfuse 是模型调用观测台，账号与 OpenScience 独立；通过项目 SSH 隧道访问。登录和私密凭据交接见 [Langfuse 说明](infra/development-platform/langfuse/README.md#login-handoff)。它不负责证明论文或图片正确。

---

## 🔒 安全文档

沙箱环境安全相关文档：

- **[威胁模型文档](docs/security/sandbox-threat-model.md)** - 系统化威胁分析、攻击向量、残留风险评估
- **[安全承诺与免责声明](docs/security/sandbox-security-statement.md)** - 安全措施说明、用户责任、法律免责
- **[生产安全检查清单](docs/security/production-security-checklist.md)** - 生产前必做事项、定期审查清单

安全测试代码：
- [现有安全测试](apps/science-worker/test/sandbox-security.test.ts) - 8 项网络/资源/文件系统测试
- [逃逸基线测试](apps/science-worker/test/sandbox-escape.test.ts) - 8 项容器逃逸和策略绕过测试

如发现安全漏洞，请通过负责任披露流程报告（见安全承诺文档）。
