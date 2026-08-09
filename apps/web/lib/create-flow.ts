export type CreateMode = 'blank' | 'material';

export interface CreateInput {
  title: string;
  mode: CreateMode;
  material: string;
  disclosure: boolean;
}

export function validateCreateInput(input: CreateInput): { ok: true } | { ok: false; error: 'title' | 'material' | 'disclosure' } {
  if (!input.title.trim()) return { ok: false, error: 'title' };
  if (input.mode === 'material' && !input.material.trim()) return { ok: false, error: 'material' };
  if (input.mode === 'material' && !input.disclosure) return { ok: false, error: 'disclosure' };
  return { ok: true };
}
