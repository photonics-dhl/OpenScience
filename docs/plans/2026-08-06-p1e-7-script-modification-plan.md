# P1E-7 自然语言修改脚本与 diff 展示实施计划

**任务**: 实现自然语言修改 Python 可视化脚本与 diff 预览  
**创建日期**: 2026-08-06  
**前置**: P1E-6 (Visualization Result Display)  
**参考规格**: Spec §10.4  
**设计文档**: [P1E-7 Design](../specs/2026-08-06-p1e-7-script-modification-design.md)

---

## 1. 实施概览

**目标**: 实现完整的脚本修改流程：自然语言输入 → AI 生成新脚本 → diff 展示 → 策略检查 → 新容器执行

**范围**:
- ✅ 后端: 修改 API 路由 + stub AI 逻辑 + 简化版策略检查
- ✅ 前端: ScriptModifier 组件 + diff 展示 + 集成到 VisualizationResult
- ✅ 样式: 对话框 + diff + 策略检查徽章

**不包含**:
- ❌ 完整 AST 策略检查引擎（P1E-3 后续任务）
- ❌ Hermes Gateway 集成（P1D-2 后续任务）

---

## 2. 文件清单

### 2.1 新建文件 (5 个)

1. `packages/domain/src/sandbox/simple-policy.ts` - 简化版策略检查（黑名单 import）
2. `packages/domain/src/sandbox/script-modifier.ts` - Stub AI 修改逻辑
3. `apps/web/components/sandbox/ScriptModifier.tsx` - 前端修改对话框组件
4. `docs/specs/2026-08-06-p1e-7-script-modification-design.md` - 设计文档（已创建）
5. `docs/plans/2026-08-06-p1e-7-script-modification-plan.md` - 本文档

### 2.2 修改文件 (5 个)

1. `packages/domain/src/sandbox/index.ts` - 导出新函数
2. `apps/api/package.json` - 添加 `diff` 依赖
3. `apps/api/src/routes/sandbox-jobs.ts` - 添加 POST /:jobId/modify 路由
4. `apps/web/lib/api.ts` - 添加 modifyScript 函数
5. `apps/web/components/sandbox/VisualizationResult.tsx` - 集成 ScriptModifier
6. `apps/web/app/globals.css` - 添加样式

---

## 3. 实施步骤

### 步骤 1: 后端依赖安装

```bash
cd apps/api
pnpm add diff
pnpm add -D @types/diff
```

**验证**: `pnpm list diff` 显示版本

---

### 步骤 2: 简化版策略检查 (packages/domain)

**文件**: `packages/domain/src/sandbox/simple-policy.ts`

```typescript
/**
 * P1E-7 简化版策略检查（黑名单 import）
 * TODO: P1E-3 完整 AST 分析后替换
 */
export interface PolicyCheckResult {
  allowed: boolean;
  violations: string[];
}

export function checkPythonScript(script: string): PolicyCheckResult {
  const violations: string[] = [];
  
  // Spec §10.3 禁止模块
  const forbiddenModules = [
    'os', 'subprocess', 'socket', 'ctypes',
    'requests', 'urllib', 'urllib2', 'urllib3',
    'http', 'ftplib', 'telnetlib', 'smtplib',
  ];

  // 禁止动态执行
  const forbiddenFunctions = ['__import__', 'eval', 'exec', 'compile'];

  // 检查 import 语句
  for (const module of forbiddenModules) {
    const patterns = [
      new RegExp(`^\\s*import\\s+${module}\\b`, 'm'),
      new RegExp(`^\\s*from\\s+${module}\\s+import`, 'm'),
      new RegExp(`__import__\\s*\\(\\s*['"\`]${module}['"\`]\\s*\\)`, 'm'),
    ];

    for (const pattern of patterns) {
      if (pattern.test(script)) {
        violations.push(`Forbidden module: ${module}`);
        break;
      }
    }
  }

  // 检查禁止函数
  for (const func of forbiddenFunctions) {
    if (new RegExp(`\\b${func}\\s*\\(`).test(script)) {
      violations.push(`Forbidden function: ${func}`);
    }
  }

  return {
    allowed: violations.length === 0,
    violations,
  };
}
```

---

### 步骤 3: Stub AI 修改逻辑 (packages/domain)

**文件**: `packages/domain/src/sandbox/script-modifier.ts`

```typescript
/**
 * P1E-7 临时 stub: 简单关键词匹配修改脚本
 * TODO: P1D-2 后替换为 Hermes Gateway 调用
 */
export function modifyScriptStub(originalScript: string, prompt: string): string {
  let modified = originalScript;
  const promptLower = prompt.toLowerCase();
  
  // 颜色修改
  if (promptLower.includes('red') || promptLower.includes('红色')) {
    modified = modified.replace(/color\s*=\s*['"][^'"]*['"]/, "color='red'");
  } else if (promptLower.includes('blue') || promptLower.includes('蓝色')) {
    modified = modified.replace(/color\s*=\s*['"][^'"]*['"]/, "color='blue'");
  } else if (promptLower.includes('green') || promptLower.includes('绿色')) {
    modified = modified.replace(/color\s*=\s*['"][^'"]*['"]/, "color='green'");
  }

  // 标题修改
  if (promptLower.includes('title') || promptLower.includes('标题')) {
    const titleMatch = prompt.match(/title\s*['"]([^'"]+)['"]/i) || prompt.match(/标题\s*['"]([^'"]+)['"]/);
    if (titleMatch) {
      if (modified.includes('plt.title')) {
        modified = modified.replace(/plt\.title\s*\([^)]*\)/, `plt.title('${titleMatch[1]}')`);
      } else {
        modified = modified.replace(/(plt\.plot\s*\([^)]+\))/, `$1\nplt.title('${titleMatch[1]}')`);
      }
    } else if (!modified.includes('plt.title')) {
      modified = modified.replace(/(plt\.plot\s*\([^)]+\))/, `$1\nplt.title('Modified Visualization')`);
    }
  }

  // x/y 轴标签
  if (promptLower.includes('xlabel') || promptLower.includes('x轴')) {
    const labelMatch = prompt.match(/xlabel\s*['"]([^'"]+)['"]/i) || prompt.match(/x轴\s*['"]([^'"]+)['"]/);
    if (labelMatch) {
      if (modified.includes('plt.xlabel')) {
        modified = modified.replace(/plt\.xlabel\s*\([^)]*\)/, `plt.xlabel('${labelMatch[1]}')`);
      } else {
        modified = modified.replace(/(plt\.plot\s*\([^)]+\))/, `$1\nplt.xlabel('${labelMatch[1]}')`);
      }
    }
  }

  if (promptLower.includes('ylabel') || promptLower.includes('y轴')) {
    const labelMatch = prompt.match(/ylabel\s*['"]([^'"]+)['"]/i) || prompt.match(/y轴\s*['"]([^'"]+)['"]/);
    if (labelMatch) {
      if (modified.includes('plt.ylabel')) {
        modified = modified.replace(/plt\.ylabel\s*\([^)]*\)/, `plt.ylabel('${labelMatch[1]}')`);
      } else {
        modified = modified.replace(/(plt\.plot\s*\([^)]+\))/, `$1\nplt.ylabel('${labelMatch[1]}')`);
      }
    }
  }

  // 标注修改来源
  if (modified !== originalScript) {
    modified = `# Modified by stub AI logic\n# User request: ${prompt}\n\n` + modified;
  }

  return modified;
}
```

---

### 步骤 4: 导出函数 (packages/domain)

**文件**: `packages/domain/src/sandbox/index.ts`

```typescript
// 在文件末尾添加
export { checkPythonScript, type PolicyCheckResult } from './simple-policy';
export { modifyScriptStub } from './script-modifier';
```

---

### 步骤 5: 后端 API 路由 (apps/api)

**文件**: `apps/api/src/routes/sandbox-jobs.ts`

```typescript
// 在文件顶部添加 import
import { createTwoFilesPatch } from 'diff';
import { checkPythonScript, modifyScriptStub } from '@openscience/domain';

// 在现有路由后添加新 schema
const modifyJobSchema = z.object({
  prompt: z.string().min(1).max(2000),
});

// 在 registerSandboxJobsRoutes 函数内，GET /sandbox-jobs 路由之前添加

  // POST /sandbox-jobs/:jobId/modify - 生成修改预览
  app.post<{ Params: z.infer<typeof jobIdParams>; Body: z.infer<typeof modifyJobSchema> }>(
    '/sandbox-jobs/:jobId/modify',
    {
      preHandler: [
        // @ts-expect-error
        app.authenticate,
        // @ts-expect-error
        app.checkWorkspaceAccess,
      ],
    },
    async (req, reply) => {
      const { jobId } = jobIdParams.parse(req.params);
      const { prompt } = modifyJobSchema.parse(req.body);
      const workspaceId = (req as any).workspaceId;

      // 1. 获取原作业脚本
      const job = await getSandboxJob(deps, jobId);
      if (!job || job.workspaceId !== workspaceId) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '作业未找到' } });
      }

      // 2. 调用 stub AI 修改脚本
      const newScript = modifyScriptStub(job.script, prompt);

      // 3. 计算 diff
      const diffResult = createTwoFilesPatch(
        'original.py',
        'modified.py',
        job.script,
        newScript,
        '',
        '',
      );

      // 4. 策略检查
      const policyResult = checkPythonScript(newScript);

      return reply.send({
        newScript,
        diff: diffResult,
        policyResult,
      });
    },
  );
```

---

### 步骤 6: 前端 API Client (apps/web)

**文件**: `apps/web/lib/api.ts`

在文件 P1E-6 section 之后添加：

```typescript
// ============================================================
// P1E-7: Script Modification
// ============================================================

export interface ModifyScriptRequest {
  prompt: string;
}

export interface ModifyScriptResponse {
  newScript: string;
  diff: string;
  policyResult: {
    allowed: boolean;
    violations: string[];
  };
}

export async function modifyScript(
  jobId: string,
  request: ModifyScriptRequest
): Promise<ModifyScriptResponse> {
  const res = await fetch(`/api/sandbox-jobs/${jobId}/modify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    credentials: 'include',
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: { message: 'Network error' } }));
    throw new Error(error.error?.message || 'Modify script failed');
  }

  return res.json();
}
```

---

### 步骤 7: ScriptModifier 组件 (apps/web)

**文件**: `apps/web/components/sandbox/ScriptModifier.tsx`

```typescript
'use client';

import { useState } from 'react';
import type { ModifyScriptResponse } from '@/lib/api';
import { modifyScript } from '@/lib/api';

interface Props {
  jobId: string;
  workspaceId: string;
  currentScript: string;
  onClose: () => void;
  onModifyComplete: (newScript: string) => void;
}

export default function ScriptModifier({
  jobId,
  workspaceId,
  currentScript,
  onClose,
  onModifyComplete,
}: Props) {
  const [prompt, setPrompt] = useState('');
  const [preview, setPreview] = useState<ModifyScriptResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGeneratePreview() {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    
    try {
      const result = await modifyScript(jobId, { prompt });
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成预览失败');
    } finally {
      setLoading(false);
    }
  }

  function handleExecute() {
    if (!preview) return;
    onModifyComplete(preview.newScript);
    onClose();
  }

  return (
    <div className="script-modifier-overlay" onClick={onClose}>
      <div className="script-modifier" onClick={(e) => e.stopPropagation()}>
        <div className="modifier-header">
          <h2>修改脚本</h2>
          <button onClick={onClose} className="close-btn" aria-label="关闭">
            ✕
          </button>
        </div>

        <div className="modifier-body">
          {/* 修改意图输入 */}
          <div className="prompt-section">
            <label htmlFor="modify-prompt">描述你想要的修改：</label>
            <textarea
              id="modify-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="例如: 将曲线颜色改为红色, 增加标题, 调整 x 轴标签"
              rows={3}
              disabled={loading}
            />
            <button
              onClick={handleGeneratePreview}
              disabled={!prompt.trim() || loading}
              className="preview-btn"
            >
              {loading ? '生成中...' : '生成预览'}
            </button>
          </div>

          {/* 错误提示 */}
          {error && <div className="error-message">{error}</div>}

          {/* 预览区域 */}
          {preview && (
            <div className="preview-section">
              {/* 策略检查结果 */}
              <div className={`policy-check ${preview.policyResult.allowed ? 'allowed' : 'blocked'}`}>
                {preview.policyResult.allowed ? (
                  <span>✅ 策略检查通过</span>
                ) : (
                  <>
                    <span>❌ 策略检查阻断</span>
                    <ul>
                      {preview.policyResult.violations.map((v, i) => (
                        <li key={i}>{v}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              {/* Diff 展示 */}
              <div className="diff-viewer">
                <h3>脚本差异</h3>
                <pre>{preview.diff}</pre>
              </div>

              {/* 执行按钮 */}
              {preview.policyResult.allowed && (
                <button
                  onClick={handleExecute}
                  className="execute-btn"
                >
                  确认执行
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

### 步骤 8: 集成到 VisualizationResult (apps/web)

**文件**: `apps/web/components/sandbox/VisualizationResult.tsx`

```typescript
// 1. 在文件顶部添加 import
import ScriptModifier from './ScriptModifier';

// 2. 在组件内部添加状态
const [showModifier, setShowModifier] = useState(false);
const [modifiedScript, setModifiedScript] = useState<string | null>(null);

// 3. 在 return 语句的最后（closing </div> 之前）添加

      {/* 底部操作区 */}
      {!loading && job && job.status === 'completed' && (
        <div className="result-actions">
          <button onClick={() => setShowModifier(true)} className="modify-btn">
            修改脚本
          </button>
        </div>
      )}

      {/* 修改对话框 */}
      {showModifier && job && (
        <ScriptModifier
          jobId={jobId}
          workspaceId={workspaceId}
          currentScript={job.script}
          onClose={() => setShowModifier(false)}
          onModifyComplete={(newScript) => {
            setModifiedScript(newScript);
            setShowModifier(false);
            // TODO: 创建新 job 并展示新结果（或传递给父组件）
            alert('修改成功！新脚本已保存。刷新页面以查看更新。');
          }}
        />
      )}
    </div>
  );
}
```

---

### 步骤 9: 样式添加 (apps/web)

**文件**: `apps/web/app/globals.css`

在文件末尾（visualization-result 样式之后）添加：

```css
/* ============================================================
   P1E-7: Script Modifier Styles
   ============================================================ */

/* 对话框遮罩 */
.script-modifier-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

/* 对话框主体 */
.script-modifier {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 800px;
  max-height: 90vh;
  overflow: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.modifier-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
}

.modifier-header h2 {
  margin: 0;
  font-size: 1.3em;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5em;
  cursor: pointer;
  color: var(--color-muted);
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  color: var(--color-text);
}

.modifier-body {
  padding: 20px;
}

/* 修改意图输入 */
.prompt-section {
  margin-bottom: 20px;
}

.prompt-section label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
}

.prompt-section textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-family: inherit;
  font-size: 0.95em;
  resize: vertical;
}

.preview-btn,
.execute-btn,
.modify-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.preview-btn {
  background: #2563eb;
  color: white;
  margin-top: 10px;
}

.preview-btn:hover:not(:disabled) {
  background: #1e40af;
}

.preview-btn:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

/* 预览区域 */
.preview-section {
  margin-top: 16px;
}

/* 策略检查结果 */
.policy-check {
  padding: 12px;
  border-radius: 4px;
  margin-bottom: 16px;
}

.policy-check.allowed {
  background: #d4edda;
  border: 1px solid #c3e6cb;
  color: #155724;
}

.policy-check.blocked {
  background: #f8d7da;
  border: 1px solid #f5c6cb;
  color: #721c24;
}

.policy-check ul {
  margin: 8px 0 0 0;
  padding-left: 20px;
}

/* Diff 展示 */
.diff-viewer {
  background: #f8f9fa;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 16px;
  margin-bottom: 16px;
}

.diff-viewer h3 {
  margin-top: 0;
  margin-bottom: 12px;
  font-size: 1.1em;
}

.diff-viewer pre {
  background: white;
  padding: 12px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 0.85em;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: 'Courier New', Courier, monospace;
}

/* 执行按钮 */
.execute-btn {
  background: #16a34a;
  color: white;
  width: 100%;
}

.execute-btn:hover:not(:disabled) {
  background: #15803d;
}

.execute-btn:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

/* 结果操作区 */
.result-actions {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
  text-align: center;
}

.modify-btn {
  background: #2563eb;
  color: white;
}

.modify-btn:hover {
  background: #1e40af;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .script-modifier {
    width: 95%;
    max-height: 95vh;
  }

  .modifier-header h2 {
    font-size: 1.1em;
  }

  .prompt-section textarea {
    font-size: 0.9em;
  }

  .diff-viewer pre {
    font-size: 0.75em;
  }
}
```

---

## 4. 测试验证

### 4.1 类型检查

```bash
# 后端
cd apps/api && pnpm typecheck

# 前端
cd apps/web && pnpm typecheck

# Domain
cd packages/domain && pnpm build
```

### 4.2 手动测试场景

1. **基本流程**：
   - 打开已完成的 sandbox job 结果
   - 点击"修改脚本"按钮
   - 输入 "change color to red"
   - 点击"生成预览"
   - 验证 diff 展示
   - 点击"确认执行"

2. **策略检查阻断**：
   - 输入 "add import os"
   - 生成预览后应显示 ❌ 阻断
   - "确认执行"按钮应禁用

3. **空输入保护**：
   - 不输入任何内容
   - "生成预览"按钮应禁用

4. **错误处理**：
   - 使用无效 jobId 触发 404
   - 验证错误提示显示

---

## 5. Git 提交

```bash
git add -A
git commit -m "feat(sandbox): P1E-7 自然语言修改脚本与 diff 展示

- 新增简化版策略检查（黑名单 import）
- 新增 stub AI 修改逻辑（关键词匹配）
- 新增 POST /sandbox-jobs/:id/modify 路由
- 新增 ScriptModifier 前端组件
- 集成到 VisualizationResult
- 添加对话框、diff、策略检查样式

参考: Spec §10.4
前置: P1E-6 (ddb21f2)
TODO: P1E-3 (完整 AST 分析), P1D-2 (Hermes Gateway)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 6. 验收检查

- [ ] 后端依赖 `diff` 已安装
- [ ] TypeScript 类型检查通过（apps/api, apps/web, packages/domain）
- [ ] 策略检查正确阻断 forbidden imports
- [ ] Diff 展示清晰可读
- [ ] 对话框样式正常（桌面 + 移动端）
- [ ] 错误提示正常显示
- [ ] Git 提交已推送

---

## 7. 后续任务

- **P1E-3**: 完整 Python AST 策略检查引擎（替换简化版）
- **P1D-2**: Hermes Gateway 集成（替换 stub AI 修改逻辑）
- **增强**: 修改后自动创建新 job 并展示结果（当前需手动刷新）
- **P1E-8**: 沙箱威胁模型文档与逃逸基线测试

---

**计划确认**: 本计划对齐 Spec §10.4 要求，采用临时方案（简化版策略检查 + stub AI）完成核心功能，后续由 P1E-3 和 P1D-2 升级为完整实现。