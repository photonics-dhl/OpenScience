# OpenScience

开放科学研究成果发布平台

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