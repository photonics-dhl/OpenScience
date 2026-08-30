interface PrismaUniqueError {
  code?: unknown;
  meta?: { modelName?: unknown; target?: unknown };
}

export interface PrismaIdempotencyConstraint {
  modelName: string;
  field: string;
  column: string;
  constraint: string;
}

function matchesTarget(target: unknown, identity: PrismaIdempotencyConstraint): boolean {
  const accepted = new Set([identity.field, identity.column, identity.constraint]);
  if (typeof target === 'string') return accepted.has(target);
  return Array.isArray(target)
    && target.length === 1
    && typeof target[0] === 'string'
    && accepted.has(target[0]);
}

export function throwOwnedPrismaIdempotencyConflict(
  error: unknown,
  identity: PrismaIdempotencyConstraint,
): never {
  const candidate = error as PrismaUniqueError;
  if (candidate?.code !== 'P2002'
    || candidate.meta?.modelName !== identity.modelName
    || !matchesTarget(candidate.meta?.target, identity)) {
    throw error;
  }
  throw Object.assign(new Error('Idempotency constraint conflict'), {
    code: 'P2002', openscienceIdempotencyConflict: true, cause: error,
  });
}

export function isOwnedPrismaIdempotencyConflict(error: unknown): boolean {
  return (error as { code?: unknown })?.code === 'P2002'
    && (error as { openscienceIdempotencyConflict?: unknown }).openscienceIdempotencyConflict === true;
}
