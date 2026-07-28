export type MigrateCommand = 'deploy' | 'status' | 'reset-dev';

const PRODUCTION_FORBIDDEN: ReadonlySet<MigrateCommand> = new Set(['reset-dev']);

/**
 * Spec §15：生产环境禁止自动执行破坏性迁移。
 * reset-dev 会清空并重放全部迁移，仅允许非生产环境。
 */
export function assertMigrateCommandAllowed(
  command: MigrateCommand,
  nodeEnv: string | undefined,
): void {
  if (nodeEnv === 'production' && PRODUCTION_FORBIDDEN.has(command)) {
    throw new Error(
      `Refused: migrate command "${command}" is destructive and forbidden when NODE_ENV=production (Spec §15).`,
    );
  }
}
