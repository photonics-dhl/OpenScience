'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';
import type { ChangeEvent } from 'react';

import {
  RESEARCH_IDENTITIES,
  type ResearchIdentity,
  type ResearchIdentityProfileInput,
} from '@/lib/api';

export const EMPTY_RESEARCH_PROFILE: ResearchIdentityProfileInput = {
  identities: ['reader'],
  primaryIdentity: 'reader',
  disciplines: [],
  methods: [],
  topics: [],
  languages: [],
};

function parseProfileTokens(value: string): string[] {
  return [...new Set(value.split(/[,，\n]/u).map((token) => token.trim()).filter(Boolean))].slice(0, 100);
}

export function applyProfileTokenDraft(value: string) {
  return { draft: value, tokens: parseProfileTokens(value) };
}

interface ResearchProfileFieldsProps {
  value: ResearchIdentityProfileInput;
  onChange(value: ResearchIdentityProfileInput): void;
}

export function ResearchProfileFields({ value, onChange }: ResearchProfileFieldsProps) {
  const t = useTranslations('researchIdentity');
  const [drafts, setDrafts] = React.useState(() => ({
    disciplines: value.disciplines.join(', '),
    methods: value.methods.join(', '),
    topics: value.topics.join(', '),
    languages: value.languages.join(', '),
  }));
  React.useEffect(() => {
    setDrafts((current) => {
      const next = { ...current };
      let changed = false;
      for (const field of ['disciplines', 'methods', 'topics', 'languages'] as const) {
        if (JSON.stringify(parseProfileTokens(current[field])) !== JSON.stringify(value[field])) {
          next[field] = value[field].join(', ');
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [value.disciplines, value.languages, value.methods, value.topics]);
  function toggle(identity: ResearchIdentity, checked: boolean) {
    const identities = checked
      ? [...value.identities, identity]
      : value.identities.filter((candidate) => candidate !== identity);
    if (identities.length === 0) return;
    onChange({
      ...value,
      identities,
      primaryIdentity: identities.includes(value.primaryIdentity) ? value.primaryIdentity : identities[0]!,
    });
  }
  function tokens(field: 'disciplines' | 'methods' | 'topics' | 'languages') {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const next = applyProfileTokenDraft(event.target.value);
      setDrafts((current) => ({ ...current, [field]: next.draft }));
      onChange({ ...value, [field]: next.tokens });
    };
  }
  return (
    <fieldset className="grid gap-5 border-y border-os-rule-paper py-5" data-research-profile-fields="true">
      <legend className="px-2 font-reading text-lg text-os-ink">{t('title')}</legend>
      <p className="text-sm leading-6 text-os-muted-paper">{t('disclosure')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {RESEARCH_IDENTITIES.map((identity) => {
          const selected = value.identities.includes(identity);
          return (
            <div key={identity} className="flex min-h-11 items-center justify-between gap-3 border-b border-os-rule-paper py-2">
              <label className="flex items-center gap-2 text-sm text-os-ink">
                <input type="checkbox" checked={selected} onChange={(event) => toggle(identity, event.target.checked)} />
                {t(`identities.${identity}`)}
              </label>
              {selected ? (
                <label className="flex items-center gap-1 text-xs text-os-muted-paper">
                  <input
                    type="radio"
                    name="primary-research-identity"
                    checked={value.primaryIdentity === identity}
                    onChange={() => onChange({ ...value, primaryIdentity: identity })}
                  />
                  {t('primary')}
                </label>
              ) : null}
            </div>
          );
        })}
      </div>
      {(['disciplines', 'methods', 'topics', 'languages'] as const).map((field) => (
        <label key={field} className="grid gap-2 text-sm font-medium text-os-ink">
          {t(field)}
          <input
            className="h-11 border-0 border-b border-os-rule-paper bg-transparent px-0 text-base outline-none focus:border-os-vermilion-ink"
            value={drafts[field]}
            maxLength={2_000}
            onChange={tokens(field)}
            placeholder={t(`${field}Hint`)}
          />
        </label>
      ))}
    </fieldset>
  );
}
