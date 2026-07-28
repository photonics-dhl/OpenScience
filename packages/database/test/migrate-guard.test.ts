import { describe, expect, it } from 'vitest';
import { assertMigrateCommandAllowed } from '../src/migrate-guard';

describe('assertMigrateCommandAllowed', () => {
  it('allows deploy in production', () => {
    expect(() => assertMigrateCommandAllowed('deploy', 'production')).not.toThrow();
  });

  it('allows status in production', () => {
    expect(() => assertMigrateCommandAllowed('status', 'production')).not.toThrow();
  });

  it('rejects reset-dev in production', () => {
    expect(() => assertMigrateCommandAllowed('reset-dev', 'production')).toThrow(/forbidden/);
  });

  it('allows reset-dev outside production', () => {
    expect(() => assertMigrateCommandAllowed('reset-dev', 'development')).not.toThrow();
    expect(() => assertMigrateCommandAllowed('reset-dev', undefined)).not.toThrow();
  });
});
