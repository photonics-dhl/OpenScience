'use client';
import { JournalManagementWorkbench } from './JournalManagementWorkbench';
/** Compatibility entry; task execution still uses the server queue. */
export function JournalProcessingQueue({ journalId }: { journalId: string }) { return <JournalManagementWorkbench journalId={journalId} />; }
