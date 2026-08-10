# Hermes Live2D 资产

Hermes 任务视觉的公开资产目录。当前产品使用 `HermesVisualAdapter` 的静态矢量回退；Wanko Live2D 二进制模型尚未复制或部署。

## 迁移要求

- 候选模型来源：Scholar's Tea 中留存的 Live2D 官方 Wanko sample（创作与建模：Live2D Inc.）。
- 原始 `ReadMe.txt` 说明：一般用户/小规模事业者同意「无偿提供素材使用许可协议」后可商用；中、大规模事业者仅可用于非公开测试。
- 生产门禁：项目所有者需确认主体类别并接受当时有效的 Live2D 免费素材许可；确认前，ECS 仅部署静态回退，不部署 Wanko 二进制资产。
- 迁移时必须原样随附 `ReadMe.txt`、来源、资产清单与适用许可版本，不得移除署名或许可声明。
- 运行时必须在 LCP 后至多加载一个实例；失败与 `prefers-reduced-motion` 均保持静态回退，审批状态保持静止。
