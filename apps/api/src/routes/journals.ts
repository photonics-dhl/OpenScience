import type { FastifyInstance } from 'fastify';
import { registerJournalRoutes as registerCoreRoutes } from './journal-core-routes';
import { registerJournalWorkbenchRoutes } from './journal-workbench';
import { registerJournalDraftGuard } from './journal-draft-guard';

export { fetchJournalDoiMetadata } from './journal-core-routes';

/** Preserve the target branch's native runtime, malware scanner and publication routes. */
export function registerJournalRoutes(app: FastifyInstance, deps: Parameters<typeof registerCoreRoutes>[1]): void {
  registerJournalDraftGuard(app, deps);
  registerCoreRoutes(app, deps);
  registerJournalWorkbenchRoutes(app, deps);
}
