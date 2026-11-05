import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useLanguage } from '../../i18n/index.jsx';
import { timeAgo } from '../../lib/format.js';
import { Button, Card, Empty, LoadState, PageHeader, useLoad, cx } from '../../components/ui.jsx';

// The simulated SMS / WhatsApp inbox. Owners get messages in their language; staff get work notifications.
export default function Messages({ staff = false }) {
  const { t } = useLanguage();
  const state = useLoad(async () => (await api.get('/notifications')).data);
  const markRead = async () => { await api.post('/notifications/read'); await state.reload(true); };
  return (
    <div className="">
      <PageHeader title={staff ? 'Notifications' : t('notif.title')} subtitle={staff ? undefined : 'SMS and WhatsApp messages are simulated in this prototype and shown here.'} actions={state.data?.notifications?.some(item => !item.read) && <Button variant="secondary" size="sm" onClick={markRead}>{t('notif.markRead')}</Button>} />
      <LoadState state={state}>
        {data => data.notifications.length ? (
          <Card className="divide-y divide-line">{data.notifications.map(item => (
            <div key={item.id} className="relative px-5 py-4">
              {!item.read && <span className="absolute left-2 top-[22px] h-1.5 w-1.5 rounded-full bg-sky-600" aria-label="Unread" />}
              <div className="flex flex-wrap items-baseline gap-x-3"><p className={cx(item.read ? 'font-medium' : 'font-semibold')}>{item.title}</p><span className="ml-auto text-[13px] text-ink-muted">{!staff && `${item.channel === 'in_app' ? 'App' : item.channel === 'sms' ? 'SMS' : 'WhatsApp'} · `}{timeAgo(item.at)}</span></div>
              <p className="mt-0.5 text-sm text-ink-soft">{item.body}{item.link && <> <Link to={item.link} className="whitespace-nowrap text-ink underline decoration-line underline-offset-2 hover:decoration-ink">Open</Link></>}</p>
            </div>
          ))}</Card>
        ) : <Card><Empty title={staff ? 'No notifications yet' : t('notif.empty')} /></Card>}
      </LoadState>
    </div>
  );
}
