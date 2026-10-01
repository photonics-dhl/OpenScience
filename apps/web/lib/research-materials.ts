import { getVersionMaterials, getResearchIngestion, getResearchObject, listVersions, type ArtifactReference, type ReadOptions } from './api';

/** Keep the first revision as the write fence: any intervening commit must fail CAS. */
export async function loadAttachmentDraft(researchObjectId: string) {
  const { researchObject } = await getResearchObject(researchObjectId, { fresh: true });
  const materials = await loadResearchMaterials(researchObjectId, { fresh: true });
  return { researchObject, materials };
}

/** The manifest is authoritative; a task's original filename may have been renamed on confirmation. */
export async function loadResearchMaterials(researchObjectId: string, options?: ReadOptions) {
  const [history, ingestion] = await Promise.all([listVersions(researchObjectId, options), getResearchIngestion(researchObjectId, options)]);
  const latest = history.versions[0];
  let artifacts: ArtifactReference[] = [];
  if (latest) {
    const { version } = await getVersionMaterials(latest.versionId, options);
    if (version.versionId !== latest.versionId) throw new Error('Version snapshot mismatch');
    artifacts = version.snapshot.artifacts.map(({ artifactId, logicalPath }) => ({ artifactId, logicalPath }));
  }
  return { artifacts, versions: history.versions, ingestion };
}

/** Attachment addition must never replace a different material at the same path. */
export function appendMaterials(existing: ArtifactReference[], additions: ArtifactReference[]): ArtifactReference[] {
  const merged = [...existing];
  for (const item of additions) {
    if (merged.some((entry) => entry.artifactId === item.artifactId && entry.logicalPath === item.logicalPath)) continue;
    let logicalPath = item.logicalPath;
    let suffix = 1;
    while (merged.some((entry) => entry.logicalPath === logicalPath)) logicalPath = `${item.logicalPath}.${suffix++}`;
    merged.push({ ...item, logicalPath });
  }
  return merged;
}
