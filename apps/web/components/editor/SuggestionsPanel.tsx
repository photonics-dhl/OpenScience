'use client';

import { useTranslations } from 'next-intl';
import type { AiSuggestion } from '../../lib/suggestions';

/** 右栏：AI 建议（§5.4 MUST 以 diff 展示，确认后才写入 SDF）。 */
export default function SuggestionsPanel({
  suggestions,
  onApply,
  onDismiss,
}: {
  suggestions: AiSuggestion[];
  onApply: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const t = useTranslations('editor');

  return (
    <div>
      <h3 className="pane-title">{t('suggestions')}</h3>
      {suggestions.length === 0 && <p className="pane-meta">{t('noSuggestions')}</p>}
      {suggestions.map((s) => (
        <div key={s.id} className="suggestion-card">
          <strong>{t(s.field)}</strong>
          <div className="suggestion-diff">
            <div className="diff-before">{s.before || '（空）'}</div>
            <div className="diff-after">{s.suggestion}</div>
          </div>
          <div className="suggestion-actions">
            {s.status === 'pending' && (
              <>
                <button className="btn btn-primary" onClick={() => onApply(s.id)}>{t('applySuggestion')}</button>
                <button className="btn" onClick={() => onDismiss(s.id)}>{t('dismissSuggestion')}</button>
              </>
            )}
            {s.status === 'applied' && <span className="pane-meta">{t('suggestionApplied')}</span>}
            {s.status === 'dismissed' && <span className="pane-meta">{t('suggestionDismissed')}</span>}
          </div>
        </div>
      ))}
      <div style={{ marginTop: 24 }}>
        <h3 className="pane-title">{t('references')}</h3>
        <p className="pane-meta">（Phase 1D 接入）</p>
        <h3 className="pane-title" style={{ marginTop: 16 }}>{t('review')}</h3>
        <p className="pane-meta">（Phase 1D 接入）</p>
        <h3 className="pane-title" style={{ marginTop: 16 }}>{t('relations')}</h3>
        <p className="pane-meta">（Phase 1D 接入）</p>
      </div>
    </div>
  );
}
