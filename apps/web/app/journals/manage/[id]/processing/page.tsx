import { redirect } from 'next/navigation';
export default function JournalProcessingPage({ params }: { params: { id: string } }) { redirect(`/journals/manage/${encodeURIComponent(params.id)}?view=drafts`); }
