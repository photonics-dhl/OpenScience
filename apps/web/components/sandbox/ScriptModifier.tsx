'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ModifyScriptResponse } from '@/lib/api';
import { modifyScript, createSandboxJob } from '@/lib/api';

interface Props {
  jobId: string;
  workspaceId: string;
  onClose: () => void;
  onModifyComplete: (newJobId: string) => void;
}

export default function ScriptModifier({
  jobId,
  workspaceId,
  onClose,
  onModifyComplete,
}: Props) {
  const t = useTranslations('productSurfaces');
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
      setError(err instanceof Error ? err.message : t('sandbox.previewError'));
    } finally {
      setLoading(false);
    }
  }

  async function handleExecute() {
    if (!preview) return;
    setExecuting(true);
    setError(null);

    try {
      // 创建新 sandbox job（workspaceId 由 props 传入，对齐 POST /sandbox-jobs body）
      const result = await createSandboxJob({ workspaceId, script: preview.newScript });
      onModifyComplete(result.job.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sandbox.executeError'));
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div className="script-modifier-overlay" onClick={onClose}>
      <div className="script-modifier" onClick={(e) => e.stopPropagation()}>
        <div className="modifier-header">
          <h2 className="font-editorial text-3xl font-normal text-os-paper">{t('sandbox.modify')}</h2>
          <button onClick={onClose} className="rounded-panel p-2 text-os-paper" aria-label={t('sandbox.close')}>
            ✕
          </button>
        </div>

        <div className="modifier-body">
          {/* 修改意图输入 */}
          <div className="prompt-section">
            <label className="text-sm text-os-paper" htmlFor="modify-prompt">{t('sandbox.modifyPrompt')}</label>
            <textarea
              id="modify-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('sandbox.modifyPlaceholder')}
              rows={3}
              disabled={loading || executing}
            />
            <button
              onClick={handleGeneratePreview}
              disabled={!prompt.trim() || loading || executing}
              className="preview-btn"
            >
              {loading ? t('sandbox.previewing') : t('sandbox.preview')}
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
                  <span>{t('sandbox.policyPassed')}</span>
                ) : (
                  <>
                    <span>{t('sandbox.policyBlocked')}</span>
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
                <h3>{t('sandbox.diff')}</h3>
                <pre>{preview.diff}</pre>
              </div>

              {/* 执行按钮 */}
              {preview.policyResult.allowed && (
                <button
                  onClick={handleExecute}
                  disabled={executing}
                  className="execute-btn"
                >
                  {executing ? t('sandbox.starting') : t('sandbox.confirmExecute')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
