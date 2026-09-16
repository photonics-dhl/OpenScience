# Token Smart 分享包
版本：2026-09-07。把整个zip发送同事即可；无需发送项目仓库、个人AGENTS、.codex配置、历史聊天、Cookie、登录信息、密钥或截图。

## 安装
先解压，查看skills/token-smart/SKILL.md和PROMPTS.md。
将skills/token-smart整个文件夹复制到当前用户的 ~/.agents/skills/token-smart。
可选：同样安装skills/auto-compact。token-smart不强依赖它，有项目交接规则就沿用。
Windows路径通常是 C:/Users/<用户名>/.agents/skills；macOS/Linux是 ~/.agents/skills。
已有同名skill先比较、备份再合并，不复制成两个同名来源，不覆盖同事其他配置。
单项目使用可放 <repo>/.agents/skills，但不要同时保留全局与项目同名副本。
重启整个桌面应用不是安装步骤。新任务核对技能列表能发现token-smart；未发现先查位置/禁用设置，必要时按当前客户端刷新方法处理。

## 自动使用
把AGENTS-SNIPPET.md内容合并到用户全局AGENTS或指定项目AGENTS之一，不替换现有文件。
Skill是模型执行指引，非后台常驻服务。自动匹配已启用，但不保证每个客户端都具备浏览器和显式子模型工具。
在另一个项目启动新任务，发PROMPTS.md中的日常prompt；不要带本项目历史/生产地址。

## 环境能力
必需：支持本地skills的Codex。run-check脚本需要Node，其他文本流程不依赖脚本。
可选：支持显式model/effort的subagent工具；普通Chat账户及正式浏览器控制工具，网页模型由本人权益决定。
本包不包含浏览器插件、MCP、登录态、代理、模型或API密钥。仅复制skill不会凭空接通网页，也不会改变当前主模型。
主会话本身也收费：如果持续使用高成本主模型，即便子任务便宜，长历史、协调和浏览器返回仍由主模型处理。默认保留用户选择的强主模型，优先减少重复上下文和委派有界执行。子任务低档通过不代表主模型可降档；只有用户要求并有代表性质量证据时才评估主模型替换。由用户在客户端选择并核实，不由skill假装自动切换；不保证目标账户具备同名型号。
网页无法操作时如实报告；可先完成本地工作。登录由同事自行完成，不能共享账号。
scripts/metered-run*仅为已授权额外模型任务的可选计量；会耗额度，不在安装自检中调用。
scripts/save-browser-text.mjs是保留的旧兼容工具，默认不用，不允许读取私有session日志绕过限制。
费用脚本费率固定日期；使用前确认当前官方费率/速度适用。

## 验证而非保证
VALIDATION.md写明本包实际检查及尚未证明的内容。
不会承诺固定节省比例或复杂任务质量无条件等同。每项目以真实纵向验收、缺陷及完整用量决定路由。
依据：[官方skill位置](https://learn.chatgpt.com/docs/build-skills)、[subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)、[费用](https://learn.chatgpt.com/docs/pricing)。
