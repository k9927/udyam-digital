import { useState } from 'react';
import { LifeBuoy } from 'lucide-react';
import { api, errorMessage } from '../../api/client.js';
import { useLanguage } from '../../i18n/index.jsx';
import { dateTime } from '../../lib/format.js';
import { Avatar, Badge, Button, Card, Empty, Field, LoadState, PageHeader, STATUS_TONE, useLoad, useToast, cx } from '../../components/ui.jsx';

const CATEGORIES = ['no_internet', 'slow_speed', 'billing', 'device', 'other'];

export default function Help() {
  const { t } = useLanguage();
  const toast = useToast();
  const [form, setForm] = useState({ category: 'no_internet', subject: '', message: '' });
  const [replies, setReplies] = useState({});
  const [busy, setBusy] = useState(false);
  const state = useLoad(async () => (await api.get('/me/tickets')).data.tickets);
  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    try { await api.post('/me/tickets', form); setForm({ category: 'no_internet', subject: '', message: '' }); toast('✓'); await state.reload(true); } catch (error) { toast(errorMessage(error), 'error'); } finally { setBusy(false); }
  };
  const reply = async id => {
    try { await api.post(`/me/tickets/${id}/messages`, { text: replies[id] }); setReplies({ ...replies, [id]: '' }); await state.reload(true); } catch (error) { toast(errorMessage(error), 'error'); }
  };
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.4fr]">
      <Card className="p-5">
        <PageHeader title={t('helpPage.new')} />
        <form onSubmit={submit} className="space-y-3">
          <Field label={t('helpPage.category')}><select className="input" value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}>{CATEGORIES.map(category => <option key={category} value={category}>{t(`cat.${category}`)}</option>)}</select></Field>
          <Field label={t('helpPage.subject')}><input className="input" required minLength={3} maxLength={120} value={form.subject} onChange={event => setForm({ ...form, subject: event.target.value })} /></Field>
          <Field label={t('helpPage.message')}><textarea className="input min-h-28" required minLength={3} value={form.message} onChange={event => setForm({ ...form, message: event.target.value })} /></Field>
          <Button type="submit" className="w-full" loading={busy}>{t('helpPage.submit')}</Button>
        </form>
      </Card>
      <div>
        <h2 className="mb-3 text-xl font-semibold">{t('helpPage.title')}</h2>
        <LoadState state={state}>
          {tickets => tickets.length ? (
            <div className="space-y-3">{tickets.map(ticket => (
              <Card key={ticket.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{ticket.subject}</p><Badge tone={STATUS_TONE[ticket.status]} className="capitalize">{ticket.status.replace('_', ' ')}</Badge></div>
                <p className="text-xs text-ink-muted">{t(`cat.${ticket.category}`)}{ticket.order && ` · ${ticket.order}`}</p>
                <ul className="mt-4 space-y-3">{ticket.messages.map((message, index) => { const mine = message.role === 'customer'; return <li key={index} className={cx('flex items-end gap-2', mine && 'flex-row-reverse')}>{!mine && <Avatar name="Accel Support" size="sm" />}<div className={cx('max-w-[80%] rounded-lg px-3.5 py-2 text-sm', mine ? 'rounded-br-sm bg-ink text-white' : 'rounded-bl-sm bg-sky-50 text-ink')}><p>{message.text}</p><p className={cx('mt-0.5 text-[11px]', mine ? 'text-white/60' : 'text-ink-muted')}>{mine ? '' : 'Accel · '}{dateTime(message.at)}</p></div></li>; })}</ul>
                <form className="mt-3 flex gap-2" onSubmit={event => { event.preventDefault(); if (replies[ticket.id]) reply(ticket.id); }}><input className="input py-2 text-sm" placeholder={`${t('adv.send')}…`} aria-label={t('adv.send')} value={replies[ticket.id] || ''} onChange={event => setReplies({ ...replies, [ticket.id]: event.target.value })} /><Button type="submit" variant="secondary" size="sm">{t('adv.send')}</Button></form>
              </Card>
            ))}</div>
          ) : <Card><Empty icon={LifeBuoy} title={t('helpPage.empty')} /></Card>}
        </LoadState>
      </div>
    </div>
  );
}
