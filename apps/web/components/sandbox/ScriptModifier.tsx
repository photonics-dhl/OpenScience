'use client';

import { useState } from 'react';
import type { ModifyScriptResponse } from '@/lib/api';
import { modifyScript, createSandboxJob } from '@/lib/api';

interface Props {
  jobId: string;
  workspaceId: string;
  currentScript: string;
  onClose: () => void;
  onModifyComplete: (newJobId: string) => void;
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
  const [executing, setExecuting] = useState(false);
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

  async function handleExecute() {
    if (!preview) return;
    setExecuting(true);
    setError(null);

    try {
      // 创建新 sandbox job
      const result = await createSandboxJob({ script: preview.newScript });
      onModifyComplete(result.job.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '执行失败');
    } finally {
      setExecuting(false);
    }
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
              disabled={loading || executing}
            />
            <button
              onClick={handleGeneratePreview}
              disabled={!prompt.trim() || loading || executing}
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
                  disabled={executing}
                  className="execute-btn"
                >
                  {executing ? '创建新任务中...' : '确认执行'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
