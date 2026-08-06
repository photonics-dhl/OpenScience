# P1E-7: 自然语言修改脚本与 diff 展示

## 1. 需求分析（Spec §10.4）

用户可用自然语言要求修改脚本或参数。每次修改都重新生成代码、展示 diff、重新进行策略检查并在新容器中执行。禁止复用可能已污染的容器。

**关键要求**：
1. **自然语言输入** → AI 生成新脚本
2. **Diff 展示**：新旧脚本对比
3. **重新策略检查**：AST 安全策略（P1E-3）
4. **新容器执行**：禁止复用，每次创建新 job
5. **前端交互**：修改意图输入 + diff 预览 + 执行确认

## 2. 现有系统回顾

### 已实现组件（P1E-3/4/5/6）
- **P1E-3**: `apps/api/src/services/sandbox/policy-engine.ts` - AST 策略检查
- **P1E-4**: `apps/api/src/services/sandbox/controller.ts` - 沙箱容器管理
- **P1E-5**: `apps/api/src/routes/sandbox.ts` - POST /api/sandbox-jobs 创建作业
- **P1E-6**: `apps/web/components/sandbox/VisualizationResult.tsx` - 结果展示

### 缺失环节
- **AI 脚本修改服务**：接收自然语言 + 原脚本 → 生成新脚本（需要 Hermes Gateway，目前未实现）
- **Diff 计算与展示**：前端/后端 diff 逻辑
- **修改历史管理**：同一可视化的多版本脚本链

## 3. 架构决策

### 3.1 AI 脚本修改流程

```
用户输入自然语言修改意图
  ↓
前端：POST /api/sandbox-jobs/:jobId/modify { prompt, previousScript }
  ↓
后端：调用 Hermes Gateway (未实现，暂用占位符)
  ↓
后端：生成新脚本 + 计算 diff
  ↓
后端：运行 AST 策略检查
  ↓
返回：{ newScript, diff, policyResult }
  ↓
前端：展示 diff + 策略结果
  ↓
用户确认后：POST /api/sandbox-jobs (新作业)
```

**问题**: Hermes Gateway（P1D-2）尚未实现，暂时如何处理？

**方案A（推荐）**: 创建 stub 实现，返回简单的脚本修改示例，标注 TODO
**方案B**: 等待 P1D-2 完成后再实现（不推荐，打断 P1E 流程）
**方案C**: 直接集成 MiniMax API（绕过 Gateway 架构，不推荐）

→ **选择方案A**: 实现完整流程框架，AI 部分暂用 stub，后续替换为 Gateway 调用

### 3.2 Diff 计算方式

**方案A（推荐）**: 后端计算 unified diff，前端展示
- 优点：前端轻量，diff 算法稳定，可缓存
- 缺点：前端依赖后端格式

**方案B**: 前端实时计算 diff
- 优点：前端灵活，可自定义展示
- 缺点：需引入 diff 库（如 diff.js），增加 bundle size

→ **选择方案A**: 后端用 Node.js `diff` 包计算 unified diff

### 3.3 数据模型扩展

当前 `SandboxJob` 模型（P1E-5）不包含"前置 job"关联。

**方案A（推荐）**: 在 modify API 响应中临时保存 previousJobId，前端管理修改链
**方案B**: 扩展 SandboxJob 模型，添加 `parentJobId` 字段
**方案C**: 创建独立 `VisualizationSession` 模型管理修改历史

→ **选择方案A**: 前端状态管理，避免现阶段数据库迁移

## 4. 实现计划

### 4.1 后端（apps/api）

#### 4.1.1 新增 API 路由 (`routes/sandbox.ts`)

```typescript
// POST /api/sandbox-jobs/:jobId/modify
// Body: { prompt: string, previousScript: string }
// Response: { newScript: string, diff: string, policyResult: PolicyResult }
```

**实现要点**：
1. 调用 `services/sandbox/script-modifier.ts`（新建）生成新脚本
2. 使用 `diff` 包计算 unified diff
3. 调用 `policy-engine.checkPythonScript(newScript)`
4. 返回结果（不创建新 job，由前端确认后调用 POST /api/sandbox-jobs）

#### 4.1.2 脚本修改服务 (`services/sandbox/script-modifier.ts`)

```typescript
interface ModifyScriptRequest {
  previousScript: string;
  prompt: string;
  context?: {
    previousResult?: string;
    environment?: { pythonVersion: string; packages: string[] };
  };
}

interface ModifyScriptResponse {
  newScript: string;
  reasoning?: string; // AI 解释修改原因
}

async function modifyScript(request: ModifyScriptRequest): Promise<ModifyScriptResponse>
```

**Stub 实现**（暂时）：
- 解析 prompt 中的关键词（如 "increase", "color", "title"）
- 简单的字符串替换或模板修改
- 返回标注 `// Modified by stub logic` 的脚本

**生产实现**（P1D-2 后）：
- 调用 Hermes Gateway `/ai/modify-visualization-script`
- 传入 previousScript + prompt + context
- 返回 AI 生成的新脚本 + reasoning

### 4.2 前端（apps/web）

#### 4.2.1 新增组件 (`components/sandbox/ScriptModifier.tsx`)

```typescript
interface ScriptModifierProps {
  currentJobId: string;
  currentScript: string;
  onModifyComplete: (newJobId: string) => void;
}
```

**UI 结构**：
1. **修改意图输入框**（Textarea）
   - 占位符示例："将曲线颜色改为红色"、"增加标题"
2. **生成预览按钮**（触发 POST /api/sandbox-jobs/:id/modify）
3. **Diff 展示区域**（Monaco Editor diff 模式 或 简单的 `<pre>` 着色）
4. **策略检查结果**（绿色通过 / 红色阻断）
5. **确认执行按钮**（调用 POST /api/sandbox-jobs 创建新 job）
6. **取消按钮**（关闭对话框）

#### 4.2.2 集成到 `VisualizationResult.tsx`

在现有组件底部添加"修改脚本"按钮，点击后弹出 `ScriptModifier` 对话框。

### 4.3 Diff 展示方案

**方案A（推荐）**: Monaco Editor Diff 组件
- 依赖：`@monaco-editor/react`（已在多数项目中使用）
- 优点：专业的代码 diff UI，语法高亮，折叠
- 缺点：需要客户端渲染（'use client'）

**方案B**: react-diff-viewer 或 diff2html
- 优点：轻量，HTML 渲染
- 缺点：可定制性低，样式需调整

**方案C**: 简单的 unified diff 文本展示
- 优点：零依赖，快速实现
- 缺点：用户体验一般

→ **选择方案A（如果 Monaco 已在项目中）或方案C（快速 MVP）**

检查当前项目依赖...

## 5. 验收标准

1. ✅ 用户在 VisualizationResult 中点击"修改脚本"
2. ✅ 输入自然语言修改意图（如 "change color to red"）
3. ✅ 系统生成新脚本并展示 diff（红色删除 + 绿色新增）
4. ✅ 策略检查结果显示（通过/阻断）
5. ✅ 用户确认后创建新 sandbox job
6. ✅ 新结果展示在新的 VisualizationResult 组件中
7. ✅ 不复用旧容器（每次 POST /api/sandbox-jobs 创建新作业）

## 6. 遗留问题

- **Hermes Gateway 集成**：P1D-2 完成后替换 stub
- **修改历史链**：当前不持久化，刷新页面后丢失（可接受，IndexedDB 已缓存结果）
- **Diff 格式化**：如选择方案C，后续可升级为 Monaco
- **多轮对话**：当前仅支持单次修改，连续修改需重复操作（可接受 MVP）

## 7. 探索结论

✅ **前端依赖** (apps/web/package.json):
- 无 Monaco Editor
- 已有 react-markdown + remark-gfm（可用于 diff 展示）
- → 采用方案C: 简单 unified diff 文本展示

✅ **后端路由** (apps/api/src/routes/sandbox-jobs.ts):
- 现有路由: POST/GET /sandbox-jobs, GET /sandbox-jobs/:jobId/artifacts/:artifactId
- 使用 Zod schema 验证
- RBAC: authenticate + checkWorkspaceAccess
- → 新增 POST /sandbox-jobs/:jobId/modify

✅ **Domain 层** (packages/domain/src/sandbox/jobs.ts):
- createSandboxJob, getSandboxJob 已实现
- SandboxJob 接口无 parentJobId 字段
- → 修改链管理暂由前端状态管理

✅ **样式模式** (apps/web/app/globals.css):
- 已有 .visualization-result 样式（P1E-6）
- 使用 CSS 变量 (--color-accent, --color-border)
- details/summary 折叠面板模式
- → 新增 .script-modifier 和 .diff-viewer 样式

## 8. 最终实现方案

### 8.1 后端 (apps/api)

1. **安装 diff 包**:
   ```bash
   cd apps/api && pnpm add diff
   ```

2. **新增路由** (routes/sandbox-jobs.ts):
   ```typescript
   POST /sandbox-jobs/:jobId/modify
   Body: { prompt: string }
   Response: { newScript: string, diff: string, policyResult: { allowed: boolean, violations: string[] } }
   ```

3. **Stub AI 脚本修改逻辑** (临时，P1D-2 后替换):
   - 简单关键词匹配修改（color, title, size, label 等）
   - 标注 `# Modified by stub AI logic` 注释

4. **AST 策略检查复用**:
   - 调用现有 policy-engine（需确认位置）

### 8.2 前端 (apps/web)

1. **新增组件** (components/sandbox/ScriptModifier.tsx):
   - 修改意图输入框 (Textarea)
   - "生成预览" 按钮 → POST /sandbox-jobs/:jobId/modify
   - Diff 展示区域（简单 `<pre>` 着色 +/- 行）
   - 策略检查结果（✅ 通过 / ❌ 阻断 + 违规列表）
   - "确认执行" 按钮 → POST /sandbox-jobs 创建新 job
   - "取消" 按钮

2. **集成到 VisualizationResult.tsx**:
   - 底部添加"修改脚本"按钮
   - 使用 useState 控制 ScriptModifier 对话框显示
   - 修改完成后关闭对话框，显示新结果

3. **样式** (app/globals.css):
   - .script-modifier 容器样式（对话框/抽屉）
   - .diff-viewer 样式（红色删除行 + 绿色新增行）
   - .policy-check 样式（通过/阻断徽章）

### 8.3 类型定义

**apps/web/lib/api.ts** 新增:
```typescript
export interface ModifyScriptRequest {
  prompt: string;
}

export interface ModifyScriptResponse {
  newScript: string;
  diff: string; // unified diff format
  policyResult: {
    allowed: boolean;
    violations: string[];
  };
}

export async function modifyScript(jobId: string, request: ModifyScriptRequest): Promise<ModifyScriptResponse>
```

## 9. 实施步骤

1. ✅ 探索现有代码结构（完成）
2. 📝 编写设计文档 (docs/specs/2026-08-06-p1e-7-script-modification-design.md)
3. 📝 编写计划文档 (docs/plans/2026-08-06-p1e-7-script-modification-plan.md)
4. 🔧 后端实现:
   - 安装 diff 包
   - 添加 /sandbox-jobs/:jobId/modify 路由
   - 实现 stub AI 修改逻辑
   - 集成 AST 策略检查
5. 🎨 前端实现:
   - ScriptModifier 组件
   - 集成到 VisualizationResult
   - 样式添加
   - API client 函数
6. ✅ TypeScript 类型检查
7. 📋 Git 提交

## 10. 待解决问题

- **AST 策略检查位置**: ❌ **P1E-3 尚未实现** - AST 策略检查引擎不存在于当前代码库
  - **临时方案**: P1E-7 实现时跳过策略检查，或实现简化版（检查 import 语句黑名单）
  - **长期方案**: 需要先实现 P1E-3 Python AST 策略检查引擎
  - **影响**: 不阻塞 P1E-7 核心功能（自然语言修改 + diff 展示），但安全检查需补充
- **Hermes Gateway 集成**: P1D-2 完成后需替换 stub 逻辑
- **Diff 库选择**: Node.js `diff` vs `fast-diff` vs 其他（建议 `diff`，成熟稳定）

## 11. P1E-3 简化版策略检查（临时方案）

由于完整的 AST 策略引擎未实现，P1E-7 将包含一个简化的黑名单检查：

```typescript
// 简化版策略检查（packages/domain/src/sandbox/simple-policy.ts）
interface PolicyCheckResult {
  allowed: boolean;
  violations: string[];
}

function checkPythonScript(script: string): PolicyCheckResult {
  const violations: string[] = [];
  
  // 黑名单 import 检查（Spec §10.3）
  const forbidden = ['os', 'subprocess', 'socket', 'ctypes', 'requests', 'urllib'];
  for (const module of forbidden) {
    const patterns = [
      new RegExp(`^import ${module}\\b`, 'm'),
      new RegExp(`^from ${module} import`, 'm'),
      new RegExp(`__import__\\(['"]${module}['"]\\)`)
    ];
    for (const pattern of patterns) {
      if (pattern.test(script)) {
        violations.push(`Forbidden module: ${module}`);
      }
    }
  }
  
  return {
    allowed: violations.length === 0,
    violations
  };
}
```

**注**: 这是临时方案，完整的 AST 分析（检测 eval、exec、动态安装等）需要 P1E-3 实现。
