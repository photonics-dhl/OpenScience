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
      className="min-h-10 border-0 border-b border-white/25 bg-transparent px-0 text-sm text-white outline-none focus:border-[#ef4c2f] focus-visible:ring-2 focus-visible:ring-[#ef4c2f]/50"
      value={value}
      onChange={(event) => onChange(event.target.value as MaterialRole)}
    >
      {ROLES.map((role) => <option className="bg-[#11100f]" key={role} value={role}>{t(`roles.${role}`)}</option>)}
    </select>
  );
}
