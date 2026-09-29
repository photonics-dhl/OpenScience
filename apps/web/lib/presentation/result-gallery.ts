import type { PresentationAsset } from '../api';

function sources(ids: readonly string[]): string {
  return JSON.stringify([...ids].sort());
}

function sameScope(a: PresentationAsset, b: PresentationAsset): boolean {
  return a.researchObjectId === b.researchObjectId && a.versionId === b.versionId;
}

/** Presentation only: never removes assets or changes their review capabilities. */
export function arrangePresentationResults(assets: readonly PresentationAsset[], allAssets: readonly PresentationAsset[]) {
  const byId = new Map(allAssets.map(asset => [asset.id, asset]));
  const children = new Map<string, PresentationAsset[]>();
  for (const asset of allAssets) {
    const base = asset.storyboard?.baseAssetId;
    if (base) children.set(base, [...(children.get(base) ?? []), asset]);
  }

  function family(plan: PresentationAsset, sceneIndex: number): string {
    let current = plan;
    const visited = new Set([plan.id]);
    while (current.storyboard?.baseAssetId) {
      const baseId = current.storyboard.baseAssetId;
      const base = byId.get(baseId);
      // Only an explicit selected-scene art revision or a single-scene chain
      // establishes correspondence. Unknown/same-scene branches remain separate.
      if (visited.has(baseId) || !base?.storyboard) return plan.id;
      const currentScenes = current.storyboard.document.scenes;
      const baseScenes = base.storyboard.document.scenes;
      const mapped = (currentScenes.length === 1 && baseScenes.length === 1)
        || (current.storyboard.artSceneIndex === sceneIndex && currentScenes.length === baseScenes.length);
      const branches = children.get(baseId)?.filter(child => child.storyboard?.artSceneIndex === undefined
        || child.storyboard.artSceneIndex === sceneIndex);
      if (branches?.length !== 1 || !sameScope(current, base)
        || current.storyboard.output !== 'image' || base.storyboard.output !== 'image'
        || !mapped || !currentScenes[sceneIndex] || !baseScenes[sceneIndex]
        || !current.sourceClaimIds.length || sources(current.sourceClaimIds) !== sources(base.sourceClaimIds)
        || sources(currentScenes[sceneIndex].sourceClaimIds) !== sources(baseScenes[sceneIndex].sourceClaimIds)) break;
      visited.add(baseId);
      current = base;
    }
    return current.id;
  }

  function key(asset: PresentationAsset): string {
    const scene = asset.sceneImage;
    const plan = scene && byId.get(scene.storyboardAssetId);
    // Missing ancestry, dates, unbound uploads and videos stay independently
    // visible. Labels and content hashes never establish a revision family.
    if (asset.kind !== 'image' || !scene || !plan?.storyboard || !sameScope(asset, plan)
      || !Number.isInteger(scene.sceneIndex) || !plan.storyboard.document.scenes[scene.sceneIndex]
      || !Number.isFinite(Date.parse(asset.createdAt))) return JSON.stringify(['asset', asset.id]);
    return JSON.stringify(['scene', asset.researchObjectId, asset.versionId, family(plan, scene.sceneIndex), scene.sceneIndex, sources(asset.sourceClaimIds)]);
  }

  const newestFirst = (a: PresentationAsset, b: PresentationAsset) =>
    (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);
  const groups = new Map<string, PresentationAsset[]>();
  for (const asset of [...assets].sort(newestFirst)) {
    const identity = key(asset);
    const group = groups.get(identity) ?? [];
    group.push(asset);
    groups.set(identity, group);
  }
  const current: PresentationAsset[] = [];
  const history: PresentationAsset[] = [];
  for (const group of groups.values()) {
    const latestUsable = group.find(asset => asset.status === 'approved' || (asset.status === 'draft' && asset.canApprove));
    const selected = latestUsable ?? group.find(asset => asset.status !== 'rejected') ?? group[0];
    current.push(selected);
    history.push(...group.filter(asset => asset !== selected));
  }
  return { current: current.sort(newestFirst), history: history.sort(newestFirst) };
}
