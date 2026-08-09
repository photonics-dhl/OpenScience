# ADR-006 — Ingestion parser 与 OCR 策略

- Status: Accepted for implementation
- Date: 2026-08-09

## Context

研究者导入需要处理 PDF、DOC/DOCX、TeX、Markdown、ZIP 与图片。Hermes 只能接收经过安全边界和格式解析的正文，不能把浏览器声明的 MIME 或二进制 Blob 直接送入模型。

用户提供的 `lovstudio/any2pdf` 为 MIT 许可的 Markdown→PDF 排版工具，适合未来的可复现报告导出，不承担 ingestion 的反向解析职责。

## Decision

1. 文本格式（Markdown/TeX）使用确定性 UTF-8 解码。
2. PDF 使用 `pdf-parse` 受控 adapter；DOCX 使用 Mammoth raw-text adapter。解析输入限制为 20 MiB，异常或空正文进入 `needs_review`。
3. 图片 OCR 采用分层策略：
   - 第一层：服务器本地 OCR 引擎（优先 PaddleOCR/兼容 HTTP worker，模型和语言包固定在镜像中）；
   - 第二层：可插拔 Tesseract 适配器，用于本地轻量部署；
   - 第三层：MiniMax 视觉模型 fallback，仅在前两层不可用且用户已同意外部 AI 处理时调用。
4. OCR 必须通过接口注入，记录引擎、模型版本、语言、置信度摘要和是否使用外部服务；不记录图片原文或密钥。
5. `any2pdf` 不进入 ingestion worker；后续导出链路可单独以 MIT 组件评估接入。

## Consequences

- 解析器可在没有 MiniMax 服务时继续处理文本和可用本地引擎的图片。
- 图片 OCR 与二进制解析仍需真实 fixture、隔离容器和生产镜像验收后才能解除发布门禁。
- 外部 AI fallback 必须受隐私同意、限流、审计和失败降级约束。
