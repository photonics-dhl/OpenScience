'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';

/** P1C-10 Merge 高风险确认对话框（Q5，§8.3）：后端 409 reasons → 明示触发风险项 → confirmHighRisk 重试。
 * 复用 Drawer 模式：role=dialog + focus trap + Esc（§18.3 WCAG AA）。 */
export default function HighRiskDialog({
  open,
  reasons,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  reasons: string[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('collab');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      ref.current?.focus();
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onCancel();
      };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }
    return undefined;
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="drawer-overlay" onClick={onCancel}>
      <div
        ref={ref}
        className="high-risk-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="high-risk-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="high-risk-title" className="high-risk-title">{t('highRisk.title')}</h2>
        <p>{t('highRisk.description')}</p>
        <ul className="high-risk-reasons">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <div className="dialog-actions">
          <button className="btn" onClick={onCancel}>{t('highRisk.cancel')}</button>
          <button className="btn btn-danger" onClick={onConfirm}>{t('highRisk.confirm')}</button>
        </div>
      </div>
    </div>
  );
}
