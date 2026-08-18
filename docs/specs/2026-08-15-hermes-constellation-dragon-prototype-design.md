# Hermes 少年星图龙建模原型设计

- Status: Approved for prototype
- Date: 2026-08-15
- Scope: Blender 静态母版、四视图与单个待机姿态；不接入产品运行时
- Supersedes: `2026-08-15-hermes-3d-scholar-agent-design.md`

## 1. 目标

用真实 Blender 资产验证“少年星图龙”是否能达到概念图的可爱、艺术、轻科幻和品牌识别度。原型必须先证明造型成立，再决定是否制作六态动作、GLB 或 Workspace 集成。

Hermes 的一句话故事是：一条在知识图谱中游动、沿背脊保存六类证据、用朱红尾尖标注文献的少年星图龙。

## 2. 固定品牌结构

- 紧凑、可盘卧的 S 形无翼龙身，身体不超过约 3.2 个头长。
- 温和而专注的短吻龙头；眼睛不使用动漫大眼、屏幕或镜头语言。
- 两枚贴近头部、向后扫的短页角眉冠；左冠保留一个裁切缺口。
- 一条连续墨色背脊带，准确嵌入六颗证据节点。
- 朱红尾尖为唯一高饱和记忆点，并读作引用笔而非武器。
- 四枚贴身的小型鳍状爪和一对可轻微转动的颊鳍。

## 3. 材质与色彩

| 角色 | 颜色 | Blender 材质意图 |
|---|---|---|
| 暖纸身体 | `#f1eee7` | 哑光、轻微暖色粗糙度，不做真实纸纹贴图 |
| 墨色背脊 | `#111312` | 低反射炭黑，轮廓与身体保持可读明度差 |
| 朱红尾尖 | `#ff4e22` | 哑光高识别点，不使用发光 |
| 验证节点 | `#85b77d` 与暖纸白交替 | 低强度自发光，仅用于节点识别 |

原型最多使用六个材质，不下载外部纹理，不引入第三方角色资产。

## 4. 几何与比例

- 总包围盒的宽高比目标为 `1.25–1.65`（三分之四静态姿态）。
- 头宽为躯干最大厚度的 `1.05–1.25`，避免婴儿化大头。
- 眼睛单眼宽不超过头宽的 `18%`。
- 眉冠高度不超过头高的 `18%`，前视图不得读成兔耳或鹿角。
- 尾尖不超过完整轮廓面积的 `3%`。
- 六节点必须是独立命名对象，沿背脊由头后向尾部排列。
- 原型三角面预算 `<= 80,000`；目标是可编辑母版，不追求实时最终预算。

## 5. 原型交付

Canonical editable source:

- `apps/web/assets/hermes/HermesConstellationDragon.blend`

Deterministic builder and contract:

- `apps/web/scripts/hermes/build-constellation-dragon.py`
- `apps/web/scripts/hermes/inspect-constellation-dragon.mjs`
- `apps/web/test/hermes-constellation-dragon-asset-contract.test.ts`

Review artifacts:

- `apps/web/public/hermes/prototype/constellation-dragon-three-quarter.png`
- `apps/web/public/hermes/prototype/constellation-dragon-front.png`
- `apps/web/public/hermes/prototype/constellation-dragon-side.png`
- `apps/web/public/hermes/prototype/constellation-dragon-idle.png`
- `apps/web/public/hermes/prototype/constellation-dragon-contact-sheet.png`
- `apps/web/public/hermes/prototype/constellation-dragon-manifest.json`

## 6. 验收门槛

自动合同必须证明：

- 正确命名的头、身体、背脊、尾尖、双眉冠、双颊鳍与六节点存在；
- 证据节点恰好六个；
- 材质数与三角面预算满足本设计；
- 四张独立渲染和 contact sheet 尺寸、文件头及非空像素有效；
- `.blend` 与 manifest 均由同一 builder 生成。

人工视觉验收必须同时满足：

1. 先读作友好的少年龙，而不是兔、蛇、鹿、机器人或摄像头；
2. 前视眉冠不产生兔耳感；
3. 三分之四视图可立即看到六节点背脊与朱红引用尾；
4. 48 px 缩略图仍能区分头、S 形身体和尾尖；
5. 待机盘卧姿态温和、稳定，不像攻击或生肖摆件。

若静态模型未通过，停止六态动作和产品集成，不以更多材质、灯光或后期掩盖造型问题。

## 7. 明确不做

- 不修改 `HermesVisualState`、Dashboard、Workspace 或生产 CSS。
- 不导出或加载 GLB，不引入 OGL/Three.js/Live2D。
- 不制作完整六态动画、语音口型、权限或工具能力。
- 不部署服务器，不读取 `.env`。
