import { apiRequest, getResearchIngestion, getResearchObject, listVersions, type ArtifactReference } from './api';

type AttachmentDraft = {
  researchObject: Awaited<ReturnType<typeof getResearchObject>>['researchObject'];
  materials: Awaited<ReturnType<typeof loadResearchMaterials>>;
};

const attachmentDraftRequests = new Map<string, Promise<AttachmentDraft>>();

/** Keep the first revision as the write fence: any intervening commit must fail CAS. */
export function loadAttachmentDraft(researchObjectId: string): Promise<AttachmentDraft> {
  const pending = attachmentDraftRequests.get(researchObjectId);
  if (pending) return pending;
  const request = (async () => {
    const { researchObject } = await getResearchObject(researchObjectId);
    const materials = await loadResearchMaterials(researchObjectId);
    return { researchObject, materials };
  })();
  attachmentDraftRequests.set(researchObjectId, request);
  void request.finally(() => {
    if (attachmentDraftRequests.get(researchObjectId) === request) attachmentDraftRequests.delete(researchObjectId);
  }).catch(() => {});
  return request;
}

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
