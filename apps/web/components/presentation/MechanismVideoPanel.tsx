'use client';
import * as React from 'react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { PresentationAsset, PresentationVideoRequest } from '@/lib/api';

export function MechanismVideoPanel({parent, assets, disabled, onGenerate}: {
  parent: PresentationAsset; assets: PresentationAsset[]; disabled: boolean;
  onGenerate: (claimIds: string[], request: PresentationVideoRequest) => void;
}) {
  const t = useTranslations('mechanismVideo');
  const sceneCount = parent.storyboard?.document.scenes.length ?? 0;
  const [selected, setSelected] = useState<string[]>(() => Array(sceneCount).fill(''));
  if (parent.canGenerateVideo !== true || parent.status !== 'approved' || sceneCount < 3 || sceneCount > 6) return null;
  const options = parent.storyboard.document.scenes.map((_, index) => assets.filter(asset =>
    asset.kind === 'image' && asset.status === 'approved' && asset.researchObjectId === parent.researchObjectId
    && asset.versionId === parent.versionId && asset.sceneImage?.storyboardAssetId === parent.id
    && asset.sceneImage.sceneIndex === index && asset.sourceClaimIds.length === parent.sourceClaimIds.length
    && parent.sourceClaimIds.every(id => asset.sourceClaimIds.includes(id))));
  const chosen = options.map((items, index) => items.find(item => item.id === selected[index])?.id ?? (items.length === 1 ? items[0].id : ''));
  const complete = chosen.every(Boolean) && new Set(chosen).size === sceneCount;
  return <section aria-label={t('title')} className="border-t border-os-rule-paper px-5 py-5 sm:px-6">
    <h3 className="m-0 text-base font-semibold">{t('title')}</h3>
    <p className="my-3 text-sm leading-6 text-os-muted-paper">{t('scope')}</p>
    <fieldset disabled={disabled} className="grid gap-3 border-0 p-0">
      {options.map((items, index) => <label key={index} className="grid gap-1 text-sm">
        {index + 1}. {parent.storyboard!.document.scenes[index].title}
        <span className="leading-6 text-os-muted-paper">{parent.storyboard!.document.scenes[index].narration}</span>
        <select value={chosen[index]} onChange={event => setSelected(current => current.map((id, i) => i === index ? event.target.value : id))} className="min-h-11 min-w-0 rounded border border-os-rule-paper bg-os-paper px-3">
          <option value="">{t(items.length ? 'chooseImage' : 'missingImage')}</option>
          {items.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>)}
      <p className="m-0 text-sm leading-6 text-os-muted-paper">{t('review')}</p>
      <button type="button" disabled={!complete || disabled} onClick={() => onGenerate(parent.sourceClaimIds, {profile: 'content-driven-v1', storyboardAssetId: parent.id, sceneImageAssetIds: chosen})} className="min-h-11 rounded bg-os-ink px-4 text-sm font-semibold text-os-paper disabled:opacity-40">{t('generate')}</button>
    </fieldset>
  </section>;
}
