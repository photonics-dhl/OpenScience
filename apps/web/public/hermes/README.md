# Hermes 原创 3D 资产

本目录发布 OpenScience 自有的 Hermes Scholar Automaton 网页资产。生产态在 Dashboard 延迟加载 `hermes-scholar.glb`；SSR、加载失败、WebGL context loss 和 `prefers-reduced-motion` 继续使用 `HermesVisualAdapter` 原有 SVG/CSS portrait。

## 来源与许可

- 几何、骨架、材质和六段动作均由 OpenScience 的确定性 Blender Python builder 原创生成，不包含 Wanko、Live2D、VRM、Mixamo 或其他第三方角色二进制。
- Wanko puppy 仅作为“眨眼、视线、预备动作、次级跟随”的行为参考；没有复制其几何、纹理、动作、rig 或 runtime。
- 可编辑事实源：`apps/web/assets/hermes/Hermes.blend`。
- 可复现构建：从仓库根执行 `infra/scripts/build-hermes-asset.ps1`；它使用 Blender 4.5.12 LTS Portable，并把下载、解压、可执行文件、`TEMP/TMP` 与 Blender 用户配置全部限定在项目 E 盘 `.tools/`。
- `hermes-scholar-poster.webp` 是构图预览，不是运行时模型或重建来源。

## 当前发布预算

- GLB：1,143,636 bytes；gzip level 9：298,555 bytes。
- 19,024 triangles；6 materials；6 mesh primitives / steady draw calls。
- 六段动作：`Hermes_Idle`、`Hermes_Guiding`、`Hermes_Scanning`、`Hermes_Suggesting`、`Hermes_AwaitingApproval`、`Hermes_Failed`。
- 桌面 DPR 上限 1.5；移动端 DPR 上限 1.0；无指针约 30 Hz，指针响应约 60 Hz。

结构与运行门禁见 `docs/specs/2026-08-15-hermes-3d-scholar-agent-design.md`、`docs/decisions/ADR-010-hermes-visual-runtime-and-live2d-license-gate.md` 和 `apps/web/test/visual/hermes-3d-gate.mjs`。
