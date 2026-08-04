'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { listNotifications, markNotificationRead, type NotificationView } from '../../lib/api';

/** P1C-10 通知中心（§18.1 Dashboard + §18.2）：未读优先 + 已读。 */
export default function NotificationsPanel() {
  const t = useTranslations('collab');
  const [notifications, setNotifications] = useState<NotificationView[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await listNotifications();
      setNotifications(res.notifications ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => { void load(); }, []);

  async function handleRead(id: string) {
    try {
      await markNotificationRead(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="collab-panel">
      {error && <div className="error-panel" role="alert">{error}</div>}
      <h3>{t('notifications.title')}</h3>
      <ul className="collab-list">
        {notifications.map((n) => (
          <li key={n.id} className={`collab-notif${n.read ? '' : ' unread'}`}>
            <div>
              <span className="collab-row-title">{t(`notifications.type.${n.type}`)}</span>
              <span className="collab-row-meta">{new Date(n.createdAt).toLocaleString()}</span>
            </div>
            {typeof n.payload.link === 'string' && <a className="collab-link" href={n.payload.link}>{t('notifications.view')}</a>}
            {!n.read && (
              <button className="btn" onClick={() => handleRead(n.id)}>{t('notifications.markRead')}</button>
            )}
          </li>
        ))}
        {notifications.length === 0 && <li className="collab-empty">{t('notifications.empty')}</li>}
      </ul>
    </div>
  );
}
