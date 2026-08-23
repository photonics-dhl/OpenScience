# Hermes Live2D 资产

Hermes 任务视觉的公开资产目录。当前本地候选 renderer 是
`HermesVisualAdapter` 驱动的单实例 Wanko Live2D v09；运行时只从
`live2d/` 加载闭合 Cubism bundle。原创 Optical Guide 仅作为运行时失败时
的可访问文本/结构 fallback，不冒充 Wanko 像素。

## 迁移要求

- 候选模型来源：Scholar's Tea 中留存的 Live2D 官方 Wanko sample（创作与建模：Live2D Inc.）。
- 原始 `ReadMe.txt` 说明：一般用户/小规模事业者同意「无偿提供素材使用许可协议」后可商用；中、大规模事业者仅可用于非公开测试。
- 生产门禁：项目运营主体需按 `ADR-010` 记录法律身份、主体类别、许可接受、署名、用途与终止响应；确认前，ECS 仅部署原创 renderer，不部署 Wanko 二进制资产。
- 公开 bundle 不含 `.cmo3`、`.can3`、PSD、下载归档或历史 carrier/poster；
  来源、版权声明、固定哈希与当前许可硬门见 `live2d/NOTICE.md`。
- Live2D 在 LCP 后至多加载一个实例；显式/系统 reduced-motion 与审批态
  使用同一 Cubism 模型的确定性静止帧，运行时失败保留可访问文本控制。
- 生产仍为 `06072c1` 的原创 renderer；只有 operator 完成 ADR-010 记录并
  通过 ECS 验收后，本段本地候选才可成为生产事实。
