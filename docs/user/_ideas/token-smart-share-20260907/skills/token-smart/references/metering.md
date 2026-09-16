# 实际计量（按需）
分开原始tokens、模型加权credits估算、账户实扣与产品API。网页生成和Codex协调分列；仅知一段就明确范围。

1. 优先正式工具用量事件，按任务ID去重；记录实际model/effort/speed、输入/缓存/输出、失败返工。unknown不补零。
2. Anthropic兼容input_tokens可能仅未缓存量，cache_read/cache_creation另列；input=1不证明完整输入仅1。按实际schema归一化，推理已含output时不重算。
3. 账户百分比共享窗口，不能隔离同期任务时不当单任务精确计量；不读取私有session绕过拒绝。
4. 节省率=(1-优化总成本/同质量对照总成本)×100%；纳入协调、升级、重试，一次性研究配置单列但不丢弃。没有完整对照只报实际成本/缺口。
5. 日常开发不双跑A/B。质量记录首轮缺陷、最终真实验收、未覆盖项，测试数量不是质量。

## 可选脚本
- run-check.mjs：Node即可，完整日志默认系统temp/token-smart-checks；TOKEN_SMART_LOG_DIR可改。
- metered-run.mjs：用户授权新独立计量任务且官方app-server可用时才运行，会产生模型用量；不是免费监听。固定read-only不适于实现/构建。
  `node <skill>/scripts/metered-run.mjs --exe <codex.exe> --model <available-model> --effort <supported> --service-tier default --cwd <workspace> --prompt-file <brief> --out <new-metrics.json> --answer-out <new-answer.txt>`
- estimate-credits.mjs：输入input_tokens（含缓存）、cached_input_tokens、output_tokens；不支持cache-write。内置2026-09-07标准费率，用前查当前速度/价格，非实扣。
- `node --test <skill>/scripts/metered-run.test.mjs` 只测逻辑不调用模型，不证明本机认证/路由成功。

经验：长路径sandbox错误曾造成昂贵循环；独立计量用有界已核实材料，重复环境失败停止。本地真实API验证提早，避免mock全过但产品失败。low推理不降低模型每token价。
[App server](https://learn.chatgpt.com/docs/app-server)；[费率](https://learn.chatgpt.com/docs/pricing)。历史实验留原备份/项目记录，日常不加载，不随跨项目包传播个人任务信息。
