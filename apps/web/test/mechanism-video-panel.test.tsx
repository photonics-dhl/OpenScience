import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect, it, vi} from 'vitest';
import type {PresentationAsset} from '../lib/api';
vi.mock('next-intl', () => ({useTranslations: () => (key: string) => key}));
import {MechanismVideoPanel} from '../components/presentation/MechanismVideoPanel';
const parent = {id:'story',researchObjectId:'ro',versionId:'v',status:'approved',canGenerateVideo:true,sourceClaimIds:['c'],storyboard:{document:{scenes:Array.from({length:5},(_,i)=>({title:`Scene ${i}`}))}}} as PresentationAsset;
const assets = Array.from({length:5},(_,i)=>({id:`image-${i}`,kind:'image',status:'approved',researchObjectId:'ro',versionId:'v',sourceClaimIds:['c'],sceneImage:{storyboardAssetId:'story',sceneIndex:i},label:`Image ${i}`})) as PresentationAsset[];
function render(items = assets, storyboard = parent) {return renderToStaticMarkup(createElement(MechanismVideoPanel,{parent:storyboard,assets:items,disabled:false,onGenerate:vi.fn()}));}
it('requires approved same-scope same-claim artwork for each of five scenes', () => {
  expect(render()).not.toContain('disabled=""');
  for (const patch of [{status:'draft'}, {versionId:'other'}, {researchObjectId:'other'}, {sourceClaimIds:['other']}, {sceneImage:{storyboardAssetId:'other',sceneIndex:2}}]) {
    expect(render(assets.map((a,i)=>i===2?{...a,...patch} as PresentationAsset:a))).toContain('disabled=""');
  }
});
it('does not silently choose between multiple approved scene revisions', () => {
  expect(render([...assets,{...assets[0],id:'revision'}])).toContain('disabled=""');
  expect(render(assets,{...parent,status:'draft'})).toBe('');
  expect(render(assets,{...parent,canGenerateVideo:undefined})).toBe('');
});
