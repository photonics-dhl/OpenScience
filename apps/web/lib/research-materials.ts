import { apiRequest, getResearchIngestion, listVersions, type ArtifactReference } from './api';

/** The manifest is authoritative; a task's original filename may have been renamed on confirmation. */
export async function loadResearchMaterials(researchObjectId: string) {
  const [history, ingestion] = await Promise.all([listVersions(researchObjectId), getResearchIngestion(researchObjectId)]);
  const latest = history.versions[0];
  let artifacts: ArtifactReference[] = [];
  if (latest) {
    const { version } = await apiRequest<{ version: { versionId: string; snapshot: { artifacts: ArtifactReference[] } } }>(`/api/versions/${encodeURIComponent(latest.versionId)}`);
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
