import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { LiteratureAcquisitionDisclosure } from '@/components/dashboard/LiteratureAcquisition';

const messages = { dashboard: { literature: {
  eyebrow: 'Personal literature', title: 'Find a source', description: 'Search by title, DOI, or arXiv ID.',
  roEyebrow: 'Research object literature', roTitle: 'Add a source', roDescription: 'Search source.', queryLabel: 'Title, DOI, or arXiv ID', queryPlaceholder: '10.1000/example', search: 'Search metadata', getFullText: 'Get full text', disclosure: 'Get full text', metadata: 'Metadata results', statusPending: 'Waiting in queue', statusRunning: 'Retrieving source', statusAuthRequired: 'Institutional access needs attention', statusFailed: 'Retrieval failed', statusSucceeded: 'Source ready', statusBlocked: 'Blocked', statusRetryExhausted: 'Retry exhausted', expires: 'Available until {expiresAt}', download: 'Download source', retry: 'Try again', noResults: 'No results', source: 'Open source record', recoveryError: 'Task could no longer be recovered.', error: 'Source request could not be completed.', pendingIntent: 'Pending request conflict.', reconnecting: 'Reconnecting to the task.', untitled: 'Untitled',
} } };

function Harness() {
  const [researchObjectId, setResearchObjectId] = React.useState('ro-a');
  const [userId, setUserId] = React.useState('user-a');
  const [mounted, setMounted] = React.useState(true);
  return <NextIntlClientProvider locale="en" messages={messages}>
    <button onClick={() => setResearchObjectId('ro-b')} type="button">switch-target</button>
    <button onClick={() => setResearchObjectId('ro-a')} type="button">switch-back-target</button>
    <button onClick={() => setUserId('user-b')} type="button">switch-user</button>
    <button onClick={() => setMounted(false)} type="button">unmount-disclosure</button>
    {mounted ? <LiteratureAcquisitionDisclosure instanceId="harness" onAuthenticationRequired={() => undefined} target={{ kind: 'research_object', researchObjectId }} userId={userId} /> : <p>unmounted</p>}
  </NextIntlClientProvider>;
}

createRoot(document.getElementById('root')!).render(<Harness />);
