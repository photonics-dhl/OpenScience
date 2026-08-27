export type MaterialRole = 'manuscript' | 'figure' | 'data' | 'code' | 'supplement';

export type IntakeMaterialStatus =
  | 'local'
  | 'uploading'
  | 'queued'
  | 'stored'
  | 'parsing'
  | 'needs_review'
  | 'confirmed'
  | 'written'
  | 'failed_retryable'
  | 'failed_blocked';

export interface IntakeMaterial {
  localId: string;
  file: File;
  role: MaterialRole;
  primary: boolean;
  status: IntakeMaterialStatus;
  progress: number;
  artifactId?: string;
  taskId?: string;
  errorCode?: string;
}

export interface IngestionTaskSnapshot {
  id: string;
  artifactId: string;
  logicalPath: string;
  state: Exclude<IntakeMaterialStatus, 'local'>;
  error: string | null;
}

const FIGURE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'svg']);
const DATA_EXTENSIONS = new Set(['csv', 'tsv', 'json', 'yaml', 'yml']);
const CODE_EXTENSIONS = new Set(['ipynb', 'py', 'r']);
const MANUSCRIPT_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'tex', 'zip', 'md', 'markdown']);

function inferMaterialRole(file: File): MaterialRole {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (FIGURE_EXTENSIONS.has(extension)) return 'figure';
  if (DATA_EXTENSIONS.has(extension)) return 'data';
  if (CODE_EXTENSIONS.has(extension)) return 'code';
  if (MANUSCRIPT_EXTENSIONS.has(extension)) return 'manuscript';
  return 'supplement';
}

export function createIntakeMaterials(files: File[]): IntakeMaterial[] {
  return files.map((file, index) => ({
    localId: `${file.name}:${file.size}:${file.lastModified}:${index}`,
    file,
    role: inferMaterialRole(file),
    primary: false,
    status: 'local',
    progress: 0,
  }));
}

export function setPrimaryMaterial(materials: IntakeMaterial[], localId: string | null): IntakeMaterial[] {
  return materials.map((material) => ({ ...material, primary: localId !== null && material.localId === localId }));
}

const SERVER_PROGRESS: Record<IngestionTaskSnapshot['state'], number> = {
  uploading: 35,
  queued: 50,
  stored: 60,
  parsing: 70,
  needs_review: 90,
  confirmed: 96,
  written: 100,
  failed_retryable: 70,
  failed_blocked: 70,
};

export function updateMaterialFromTask(material: IntakeMaterial, task: IngestionTaskSnapshot): IntakeMaterial {
  return {
    ...material,
    taskId: task.id,
    artifactId: task.artifactId,
    status: task.state,
    progress: Math.max(material.progress, SERVER_PROGRESS[task.state]),
    errorCode: task.error ?? undefined,
  };
}
