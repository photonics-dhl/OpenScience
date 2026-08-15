# Hermes Live2D 资产

Hermes 任务视觉的公开资产目录。当前候选 renderer 是 `HermesVisualAdapter` + `pet/` 下原创透明 2.5D 星图宠物三帧；原 Optical Guide SVG 仅作为 SSR、图片失败与 reduced-motion 的静态 fallback。该实现不是 Live2D，也不依赖第三方角色二进制。Wanko Live2D 模型尚未复制或部署。

## 迁移要求

- 候选模型来源：Scholar's Tea 中留存的 Live2D 官方 Wanko sample（创作与建模：Live2D Inc.）。
- 原始 `ReadMe.txt` 说明：一般用户/小规模事业者同意「无偿提供素材使用许可协议」后可商用；中、大规模事业者仅可用于非公开测试。
- 生产门禁：项目运营主体需按 `ADR-010` 记录法律身份、主体类别、许可接受、署名、用途与终止响应；确认前，ECS 仅部署原创 renderer，不部署 Wanko 二进制资产。
- 迁移时必须原样随附 `ReadMe.txt`、来源、资产清单与适用许可版本，不得移除署名或许可声明。
- 如后续启用，Live2D 必须在 LCP 后至多加载一个实例；失败与 `prefers-reduced-motion` 均回退原创 renderer，审批状态保持静止。
