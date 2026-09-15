'use client';

import * as React from 'react';
import { useEffect, useRef, type ReactNode } from 'react';

/** 自写抽屉（§5.4/§18.3）：aria-modal + focus trap + Esc 关闭 + 焦点还原。 */
export default function Drawer({
  open,
  onClose,
  label,
  children,
  side = 'left',
  closeLabel = 'Close',
  className = '',
  overlayClassName = '',
  inline = false,
  hideCloseButton = false,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  side?: 'left' | 'right';
  closeLabel?: string;
  className?: string;
  overlayClassName?: string;
  inline?: boolean;
  hideCloseButton?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  // 记录触发按钮（还原焦点用）
  useEffect(() => {
    if (open && !inline) {
      triggerRef.current = document.activeElement;
      const first = ref.current?.querySelector<HTMLElement>(
        'a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])',
      );
      (first ?? ref.current)?.focus();
    } else if (triggerRef.current instanceof HTMLElement) {
      triggerRef.current.focus();
    }
  }, [open, inline]);

  // Esc 关闭 + focus trap
  useEffect(() => {
    if (!open || inline) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab' && ref.current) {
        const focusables = ref.current.querySelectorAll<HTMLElement>(
          'a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, inline]);

  if (!open) return null;
  if (inline) return <div ref={ref} role="complementary" aria-label={label} className={`hermes-inline-assistant ${className}`} tabIndex={-1}>
    {!hideCloseButton && <button className="mb-3 min-h-11 text-sm text-os-muted-paper underline" onClick={onClose}>{closeLabel}</button>}{children}
  </div>;
  return (
    <div className={`drawer-overlay ${overlayClassName}`.trim()} onClick={onClose}>
      <div
        ref={ref}
        className={`drawer drawer-${side} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
        {!hideCloseButton && <button className="btn drawer-close" onClick={onClose} aria-label={closeLabel}>
          ×
        </button>}
      </div>
    </div>
  );
}
