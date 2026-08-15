# Hermes 2.5D 星图宠物设计

## 状态

Accepted for prototype implementation on 2026-08-15. Supersedes the rejected procedural Blender character as the active visual experiment; it does not erase the historical NO-GO record.

## 目标

用高质量原创透明插画和轻量网页分层，交付一个能在 Personal Workspace 中长期陪伴研究者的 Hermes。它应首先被识别为可爱、克制、有书卷气的未来知识生物，其次才显露六节点 SDF、验证与引用的产品隐喻。

## 视觉论点

- **材质**：温暖手工纸、淡水粉与细墨线；拒绝塑料高光、基础球体和廉价机械拼装。
- **轮廓**：少年星图龙的低伏 S 形身体、后掠页冠、墨绿耳鳍和朱砂引用尾；即使去掉文字仍能识别 OpenScience。
- **品牌结构**：深墨色外脊保存六枚证据节点；验证绿只出现在耳鳍核心和确认节点；朱砂只用于引用尾与高优先级状态。
- **工作台关系**：角色像停驻在仪器边缘的研究伙伴，不占据编辑主区域，不使用营销式大背景或游戏 HUD。

## 原创资产

在 `apps/web/public/hermes/pet/` 保存三张透明 RGBA PNG：

1. `hermes-pet-idle.png`：睁眼、放松、三分之四视角的 canonical 母版。
2. `hermes-pet-blink.png`：与母版轮廓、光照和画幅严格一致，仅闭眼。
3. `hermes-pet-working.png`：与母版共享完全相同的轮廓，证据节点进入工作状态；不得改物种、配色或比例。

每张图必须无文字、无边框、无背景、无投影底板；来源说明写入同目录 README。生成图只作为项目原创资产，不复用第三方角色、Live2D 二进制或仓库素材。

## 运行时分层

`HermesPetPortrait` 只负责角色呈现，`HermesVisualAdapter` 继续拥有任务链接、状态语义与权限边界。分层从后向前为：

1. 椭圆接触影与低强度暖光；
2. canonical 透明角色帧；
3. blink 或 working 状态帧；
4. 六个轻量证据节点脉冲；
5. 现有状态标签和任务入口。

不引入 Canvas、WebGL、Three.js、Cubism 或新的运行时依赖。图片用原生 `img`，避免 Next Image 在透明状态叠层中的布局和解码差异。

## 状态映射

- `idle`：母版缓慢呼吸、漂浮和周期眨眼。
- `guiding` / `suggesting`：母版轻微前倾，节点依次点亮。
- `scanning`：working 帧和从头到尾的节点扫描。
- `awaiting_approval`：完全静止，朱砂节点保持常亮。
- `failed`：不抖动角色；只让外部状态文字和单一朱砂信号提示错误。

指针只驱动整个角色最多 `6px` 平移和 `2deg` 倾斜，不伪造独立眼球跟随。离开后在 420ms 内回中。

## 无障碍与性能

- 角色图片 `alt=""`，状态含义继续由可读文本提供。
- `prefers-reduced-motion: reduce` 时禁用呼吸、漂浮、眨眼、节点脉冲和指针倾身。
- 三张 PNG 总传输预算不超过 1.5MB；单张画幅固定 824×824（对应当前 256px 展示仍超过 3× 像素密度），非透明覆盖率 12%–72%。实现时 832px 三帧的首次 RED 为 1,511,539B，因而保持预算不变并从生成母版一次归一到 824px；这不是降低视觉门槛。
- blink/working 与 idle 的 Alpha 摘要必须完全一致，状态切换不得移动角色外轮廓。
- 同一页面只允许一个 `data-hermes-instance="single"`。
- 图片缺失时保留现有文本、链接与静态 SVG fallback，不产生空白操作区。

## 验收

1. 资产合同验证 PNG 签名、尺寸、透明度、文件预算和来源说明。
2. SSR 合同验证三层帧、单实例、六状态、fallback、审批静止与 renderer 标记。
3. 真实浏览器验证 desktop/mobile、正常/reduced-motion、指针回中、无布局溢出和无 console error。
4. 用户只验收最终 Workspace 截图或页面效果；自动化 GREEN 不等于审美通过。

## 非目标

- 不制作完整 Live2D/Cubism 模型。
- 不制作 3D、GLB、骨骼蒙皮或复杂口型。
- 不改变 Hermes 权限、配额、工具或任务状态模型。
- 不部署服务器；视觉通过后另行决定集成和发布。
