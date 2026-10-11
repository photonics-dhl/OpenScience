'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/components/auth/SessionProvider';
import { getCurrentUser } from '@/lib/api';

/** Use the app's session updates; standalone previews keep their existing initial read. */
export function useHermesViewerId(): string {
  const session = useSession();
  const [standaloneViewerId, setStandaloneViewerId] = useState('');
  useEffect(() => {
    if (session.managed) return;
    let active = true;
    void getCurrentUser().then(user => { if (active) setStandaloneViewerId(user.userId); }).catch(() => undefined);
    return () => { active = false; };
  }, [session.managed]);
  return session.managed ? session.status === 'authenticated' ? session.user?.userId ?? '' : '' : standaloneViewerId;
}
