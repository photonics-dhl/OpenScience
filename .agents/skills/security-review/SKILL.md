---
name: security-review
description: "Use when reviewing code that touches auth, permissions, uploads, secrets, sandbox execution, logging, or before any public release. Do NOT use for purely cosmetic or docs-only changes."
---

# Security Review — 安全审查清单

安全审查逐条核对项，来源：Spec §17（安全与隐私）、§3.3（角色）、§10.3（沙箱限制）。

## 何时使用 / 何时不使用

- **使用**：涉及认证、权限、上传、密钥、沙箱、日志的代码评审；公开发布前检查；新增第三方依赖的安全评估。
- **不使用**：纯样式、文案、文档修改。

## 检查清单（Spec §17 MUST 项）

1. **密钥管理**：密钥仅来自服务器 Secret/环境变量，不进入仓库；代码中不得出现硬编码密钥；不得把 Secret 拉入 Agent 上下文（§17；§20.1-9）。
2. **越权检查在 API 层**：防止跨 Workspace 越权；每个受保护资源在 API 层校验调用者角色（Owner/Maintainer/Author/Contributor/Reviewer/Viewer/Moderator/Platform Admin，§3.3），禁止只靠前端隐藏。
3. **审计日志**：全部写操作记录审计日志。
4. **限流**：登录、发布、上传、AI、搜索和沙箱接口必须限流。
5. **上传安全**：上传文件进行类型检测、大小限制和恶意内容扫描（§17；配合 §13.1 分片、校验和、MIME 检测与病毒扫描）。
6. **公开前扫描**：内容公开前进行敏感信息扫描。
7. **Web 安全配置**：Session、Cookie、CSRF、CORS、CSP 正确配置；管理后台启用更强认证。
8. **日志脱敏**：生产日志不得记录完整论文、密钥、身份证信息或模型 Prompt 中的敏感附件。

## 沙箱专项（Spec §10.3 逐条核对）

9. **威胁模型单独维护**：Sandbox 威胁模型是独立文档，单独更新（§17）。
10. **资源限制**：30 秒、单核、1 GB 内存；进程数、文件数、输出大小受限。
11. **网络隔离**：禁止公网、内网、云元数据访问；沙箱容器不加入 `data_net`（§10.3、§14.2）。
12. **文件系统与权限**：非 root；只读根文件系统；临时目录；禁止宿主目录、Docker Socket 和数据库凭据。
13. **包与系统调用白名单**：仅 NumPy/SciPy/SymPy/Matplotlib/Pillow 等白名单包；禁止 `os`、`subprocess`、`socket`、`ctypes`、动态安装和任意二进制；执行完立即销毁容器。
14. **安全测试基线**：越权、上传、SSRF、Prompt Injection、Sandbox Escape 属 §21.1 安全测试层，发布前必须有对应测试证据。
