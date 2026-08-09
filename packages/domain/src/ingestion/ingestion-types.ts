export const INGESTION_TASK_STATES = [
  'queued', 'uploading', 'stored', 'parsing', 'needs_review', 'confirmed', 'written', 'failed_retryable', 'failed_blocked',
] as const;

export type IngestionTaskState = (typeof INGESTION_TASK_STATES)[number];

export interface IngestionFileInput {
  filename: string;
  content: Buffer;
  mimeType?: string;
}

export interface IngestionTaskView {
  id: string;
  artifactId: string;
  logicalPath: string;
  state: IngestionTaskState;
  retryCount: number;
  error: string | null;
  agentTaskId: string | null;
}

export interface IngestionBatchView {
  batchId: string;
  researchObjectId: string;
  tasks: IngestionTaskView[];
}
