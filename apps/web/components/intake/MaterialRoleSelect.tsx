'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';

import type { MaterialRole } from './intake-model';

const ROLES: MaterialRole[] = ['manuscript', 'figure', 'data', 'code', 'supplement'];

export function MaterialRoleSelect({ value, onChange, labelledBy }: {
  value: MaterialRole;
  onChange: (role: MaterialRole) => void;
  labelledBy: string;
}) {
  const t = useTranslations('ingestion.intake');
  return (
    <select
      aria-labelledby={labelledBy}
      className="min-h-11 border-0 border-b border-os-rule-paper bg-transparent px-0 text-sm text-os-ink outline-none focus:border-os-vermilion-ink focus-visible:ring-2 focus-visible:ring-os-vermilion-ink"
      value={value}
      onChange={(event) => onChange(event.target.value as MaterialRole)}
    >
      {ROLES.map((role) => <option key={role} value={role}>{t(`roles.${role}`)}</option>)}
    </select>
  );
}
