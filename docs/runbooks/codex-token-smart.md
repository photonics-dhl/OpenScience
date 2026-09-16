# Codex 自动省量与开发分析环节

## 状态与入口

2026-09-07；本地 `main@b9616cb92dc83437b1b2094291ff43e2a4c34337`。本任务无产品部署，ECS release / rollback 未重验、未修改。
全局技能：`C:/Users/Mac/.agents/skills/token-smart/SKILL.md`。全局 AGENTS 默认应用一次，`allow_implicit_invocation: true`；无需用户点名。自动匹配是指令机制，不是后台路由服务。

## 实际操作方案

1. 主会话只做必要取证、任务拆分和集成；小修直接完成，参考文件按需读取。
2. 有独立收益的机械工作显式委派 Luna/low，普通实现 Terra/medium；最小完整任务包、不继承无关长历史。高风险保留高推理复核。主模型设置不变，不能靠文案切换。
3. 困难分析可由有限证据判断时，使用已登录普通 Chat 自动发送一次、取回、核验并实施。遵守材料授权和工具契约，不让用户手动搬运。简单任务不走已测得更贵的网页链路；不先本地解完再网页重做。
4. 预计冗长的非交互检查通过技能 `scripts/run-check.mjs` 执行。全部输出保存本机，成功返回退出码和日志路径，失败附末尾 2400 bytes。需要数量、警告或根因时定向查原日志；必要验收不会减少。
5. 不为每个任务重复 A/B；仅针对新流程或用户量化要求计量。分别报告输入、缓存、输出及工具输出量，不把输出压缩当作整个任务的 token 节省率。

调用示例（实际执行时使用绝对脚本路径）：

```powershell
node C:/Users/Mac/.agents/skills/token-smart/scripts/run-check.mjs powershell.exe -NoProfile -Command 'npx pnpm@9.15.0 audit:docs-sync'
```

脚本适用于非交互日志命令，不能用于捕获凭据。不会解释 shell 字符串、跳过测试、改变主模型或安装第三方程序。短输出命令直接执行，避免包装成本。

## 实测与限制

- 首次网页 mean 测试完成自动发送/取回和本地 9 项测试；仅证明链路。
- 项目 Claim graph 原型对照：本地 A 与网页 B 均 26/26；A 总 token 117548，B 2085122（含缓存输入），B/A 约 17.74。网页路径没有节省。顺序/上下文非独立、网页 token 不可得，不能推导普遍比例或费用。
- 原始证据：`C:/Users/Mac/.codex/backups/token-smart-20260907/project-web-benchmark/report.md`；网页会话为 [Validate Claims Module](https://chatgpt.com/c/6a9e3a87-69c0-83ea-bf85-e1548f18b52d)。
- 本轮已显式调用 Luna/low、无历史继承的只读任务，完成上述报告核对；这验证模型路由调用，不代表已量化净节省。
- 新脚本实测：同一 Claim graph 26 项验收通过；退出码 7 的失败保留原码及错误；不存在的命令明确失败。
- 第三方 codex-bridge-chatgpt 未安装；使用本技能与原生浏览器能力，不能声称其 doctor/Copy 协议通过。跨会话自动触发稳定性、轻量浏览器执行的净收益尚未证明。

## 备份

原始优化备份：`C:/Users/Mac/.codex/backups/token-smart-20260907/`；本轮入口和元数据修改前备份为 `execution-final/`。按差异恢复，保留后续用户改动；不删除技能或历史证据。

## 2026-09-07 最终质量与成本验收

普通 Chat 的生成不计入 Codex/Work；模型费率不同，token 总数不能直接代表额度成本。官方依据：[使用额度](https://help.openai.com/en/articles/11369540-using-)、[标准费率](https://learn.chatgpt.com/docs/pricing)。新增全局 `scripts/estimate-credits.mjs` 按输入、缓存、输出估算标准 credits；算术与非法缓存输入测试 2/2 通过，不冒充账号实扣。

新本地 Terra/medium 与新网页 6 Pro 的 Claim graph 实现均通过原有 26 项及独立 2010 项检查：随机图与森林、特殊 ID、普通对象边界、20000 节点长环/链、非修改性。网页代码未经修补。此证据覆盖隔离的领域验证原型，不代表整个产品或生产发布验收。

| 路线 | 实际 Codex tokens（含缓存） | 标准 token credits 估算 | 质量 |
| --- | ---: | ---: | --- |
| 旧 Astra 本地阶段 | 117548 | 5.806800 | 26 + 2010 通过 |
| 新 Terra 本地完整子任务 | 457608 | 5.356870 | 26 + 2010 通过 |
| 新 Luna 网页操作与失败恢复子任务 | 1391119 | 1.122655 | 未独立取回；不可单列为完整成功成本 |

Terra 对旧本地阶段的估算差为减少 7.75%；对照上下文/起止范围不同，非受控因果结论。同一批 Terra 实际 tokens 若按 Astra 标准单价折算约26.003 credits，模型费率因素约减少79.4%；这仅隔离单价因素，不是假定两模型必然使用相同tokens。

网页已自动发送且最终由主会话取回并验收：[生成声明验证模块](https://chatgpt.com/c/6a9e44d5-e9f8-83e9-be43-49bbaf367950)。子任务提前结束导致浏览器绑定不可恢复；AX截断长代码，Copy无返回、export不支持，最终受支持的只读可见DOM文本提取成功。对应限制已写入 handoff 参考，不再重复探测这些已知失败路径。

本轮主会话研究、配置、独立测试、诊断和取回额外消耗显著；截至05:10:18 UTC的标准估算148.33235 credits，加两子任务为154.811875 credits，后续收尾尚未计入。**本轮整体没有净节省，不能把1.122655称为完整网页成本或声称节省80%以上。** 一次性验证开销与日常执行分列，但均真实存在。

上一轮交付：全局自动Skill、实际本地模型分工、网页自动交接及主会话恢复、完整代码和质量证据、费率估算器。稳定的轻量浏览器独立闭环与完整复杂任务的净节省率未达成，不能标为已验证。后续按实际任务使用已验证路线，不再重复同一昂贵基准。

详细证据目录：`C:/Users/Mac/.codex/backups/token-smart-20260907/final-quality/`；`accounting.json`记录实际模型、推理档、时间和token。原始新实现位于同级 `lean-local-final/A.mjs` 与 `lean-web-final/B.mjs`。脚本和参考的修改前备份为 `credit-routing-before/`。

## 最新补测：轻量网页取回与原文保存完成

2026-09-07 06:46:51–06:52:24 UTC：新Luna/low执行者从已完成会话独立取回完整模块并完成验收，复用已有回答、没有新增网页生成。实际修正为正式Browser与AX Target分开、复用自身tab、显式输出可见DOM结果；后续流程写入全局 handoff 参考。

主会话核对发现worker曾重新排版模块，随后从其真实工具输出逐字提取；`raw-from-web.mjs`与之前保存的网页原文完全一致，26+2010项检查通过。新增 `C:/Users/Mac/.agents/skills/token-smart/scripts/save-browser-text.mjs`，实测保存4023字节且原文一致，避免再次用模型重写落盘内容。

本轮Luna补测：输入1037213、其中缓存992256、输出3679，总1040892 tokens；标准费率估算0.831283 credits。连同上一轮失败的Luna网页操作1.122655，操作侧合计1.953938，对比Terra实现子任务5.35687约低63.52%。**此比例仅比较操作子任务，未计主会话指导、研究和收尾，不是完整任务净节省率。** 此次只补测已有回答取回，不冒称新网页生成全流程一次通过。前几轮配置投入未回本，真实复杂产品任务的普遍收益不能据此承诺。

证据：`C:/Users/Mac/.codex/backups/token-smart-20260907/lean-retrieval-final/accounting.json`、`raw-from-web.mjs`、`script-saved.mjs`。保存助手逐字一致性通过；同样质量标准保持。日常执行使用已验证的模型分工和原生网页路径，不再重复完整对照试验。
