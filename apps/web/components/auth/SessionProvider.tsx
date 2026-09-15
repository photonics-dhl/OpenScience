'use client';

import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ApiClientError, getCurrentUser, invalidateSessionClientCache, SESSION_CHANGED_EVENT, SESSION_INVALIDATED_EVENT, type CurrentUser } from '@/lib/api';

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous' | 'unavailable';

interface SessionContextValue {
  managed: boolean;
  user: CurrentUser | null;
  status: SessionStatus;
  refresh(fresh?: boolean): Promise<CurrentUser | null>;
}

const SessionContext = React.createContext<SessionContextValue>({
  managed: false,
  user: null,
  status: 'anonymous',
  refresh: async () => null,
});
const BACKGROUND_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const SESSION_CHANNEL = 'openscience-session';

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const lastRefreshAt = useRef(0);
  const refreshGeneration = useRef(0);
  const userRef = useRef<CurrentUser | null>(null);
  userRef.current = user;

  const refresh = useCallback(async (fresh = false) => {
    const generation = ++refreshGeneration.current;
    if (fresh) {
      userRef.current = null;
      setUser(null);
      setStatus('loading');
    }
    try {
      const current = await getCurrentUser({ fresh });
      if (generation !== refreshGeneration.current) return userRef.current;
      lastRefreshAt.current = Date.now();
      setUser(current);
      setStatus('authenticated');
      return current;
    } catch (cause) {
      if (generation !== refreshGeneration.current) return userRef.current;
      lastRefreshAt.current = Date.now();
      if (cause instanceof ApiClientError && cause.status === 401) {
        setUser(null);
        setStatus('anonymous');
        return null;
      }
      // A transient transport/server failure does not prove that the session ended.
      setStatus(userRef.current ? 'authenticated' : 'unavailable');
      return userRef.current;
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const invalidate = () => {
      refreshGeneration.current += 1;
      userRef.current = null;
      setUser(null);
      setStatus('anonymous');
    };
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(SESSION_CHANNEL);
    const invalidateAndBroadcast = () => {
      invalidate();
      channel?.postMessage('invalidated');
    };
    const refreshChangedSession = () => {
      void refresh(true);
    };
    const refreshAndBroadcast = () => {
      refreshChangedSession();
      channel?.postMessage('changed');
    };
    if (channel) channel.onmessage = (event) => {
      if (event.data === 'invalidated') {
        invalidateSessionClientCache();
        invalidate();
      }
      if (event.data === 'changed') refreshChangedSession();
    };
    window.addEventListener(SESSION_INVALIDATED_EVENT, invalidateAndBroadcast);
    window.addEventListener(SESSION_CHANGED_EVENT, refreshAndBroadcast);
    return () => {
      window.removeEventListener(SESSION_INVALIDATED_EVENT, invalidateAndBroadcast);
      window.removeEventListener(SESSION_CHANGED_EVENT, refreshAndBroadcast);
      channel?.close();
    };
  }, [refresh]);
  useEffect(() => {
    const refreshWhenFocused = () => {
      if (document.visibilityState !== 'visible') return;
      void refresh();
    };
    const refreshWhenDue = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRefreshAt.current < BACKGROUND_REFRESH_INTERVAL_MS) return;
      void refresh();
    };
    document.addEventListener('visibilitychange', refreshWhenFocused);
    window.addEventListener('focus', refreshWhenFocused);
    const interval = window.setInterval(refreshWhenDue, BACKGROUND_REFRESH_INTERVAL_MS);
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenFocused);
      window.removeEventListener('focus', refreshWhenFocused);
      window.clearInterval(interval);
    };
  }, [refresh]);

  const value = useMemo(() => ({ managed: true, user, status, refresh }), [refresh, status, user]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  return React.useContext(SessionContext);
}
