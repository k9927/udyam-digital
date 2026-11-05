import { useState } from 'react';
import { LifeBuoy, CalendarPlus } from 'lucide-react';
import { api, errorMessage } from '../../api/client.js';
import { dateTime, titleCase } from '../../lib/format.js';
import { Avatar, Badge, Button, Card, Empty, LoadState, PageHeader, STATUS_TONE, useLoad, useToast, cx } from '../../components/ui.jsx';

const WINDOWS = ['09:00–11:00', '11:00–13:00', '14:00–16:00', '16:00–18:00'];
const tomorrow = () => { const date = new Date(); date.setDate(date.getDate() + 1); return date.toLocaleDateString('en-CA'); };

export default function OpsTickets() {
  const toast = useToast();
  const [reply, setReply] = useState({});
  const [visit, setVisit] = useState({});
  const state = useLoad(async () => (await api.get('/ops/tickets')).data.tickets);
  const call = async (request, message) => { try { await request(); toast(message); await state.reload(true); } catch (error) { toast(errorMessage(error), 'error'); } };
  return (
    <div className="">
      <PageHeader eyebrow="Support" title="Customer requests" subtitle="One support number for everything the business bought. Reply, book a technician visit, or resolve." />
      <LoadState state={state}>
        {tickets => tickets.length ? <div className="space-y-4">{tickets.map(ticket => {
          const slot = visit[ticket.id] || { date: tomorrow(), window: WINDOWS[0] };
          return (
            <Card key={ticket.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-2"><div className="flex items-start gap-3"><Avatar name={ticket.business || ''} /><div><p className="font-semibold">{ticket.subject}</p><p className="text-sm text-ink-muted">{ticket.business} · {ticket.city} · {titleCase(ticket.category)}{ticket.order && ` · ${ticket.order}`}</p></div></div><Badge tone={STATUS_TONE[ticket.status]}>{titleCase(ticket.status)}</Badge></div>
              <ul className="mt-4 space-y-3">{ticket.messages.map((message, index) => { const staff = message.role !== 'customer'; return <li key={index} className={cx('flex', staff && 'justify-end')}><div className={cx('max-w-[80%] rounded-lg px-3.5 py-2 text-sm', staff ? 'rounded-br-sm bg-ink text-white' : 'rounded-bl-sm bg-paper text-ink')}><p>{message.text}</p><p className={cx('mt-0.5 text-[11px]', staff ? 'text-white/60' : 'text-ink-muted')}>{titleCase(message.role)} · {dateTime(message.at)}</p></div></li>; })}</ul>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); call(() => api.post(`/ops/tickets/${ticket.id}/reply`, { text: reply[ticket.id] }), 'Reply sent'); setReply({ ...reply, [ticket.id]: '' }); }}><input className="input min-w-[12rem] flex-1 py-2 text-sm" required placeholder="Reply to the customer" value={reply[ticket.id] || ''} onChange={event => setReply({ ...reply, [ticket.id]: event.target.value })} /><Button type="submit" size="sm" variant="secondary">Send</Button><Button size="sm" variant="secondary" onClick={() => call(() => api.post(`/ops/tickets/${ticket.id}/reply`, { text: reply[ticket.id] || 'Resolved. Thank you for your patience.', resolve: true }), 'Resolved')}>Resolve</Button></form>
                {ticket.order && !ticket.visitJob && <div className="flex flex-wrap gap-2"><input type="date" className="input w-auto py-2 text-sm" value={slot.date} onChange={event => setVisit({ ...visit, [ticket.id]: { ...slot, date: event.target.value } })} /><select className="input w-auto py-2 text-sm" value={slot.window} onChange={event => setVisit({ ...visit, [ticket.id]: { ...slot, window: event.target.value } })}>{WINDOWS.map(window => <option key={window}>{window}</option>)}</select><Button size="sm" onClick={() => call(() => api.post(`/ops/tickets/${ticket.id}/visit`, slot), 'Technician visit booked')}><CalendarPlus className="h-4 w-4" />Book technician</Button></div>}
                {ticket.visitJob && <p className="text-sm text-ok-700">✓ Technician visit booked</p>}
              </div>
            </Card>
          );
        })}</div> : <Card><Empty icon={LifeBuoy} title="No open requests" /></Card>}
      </LoadState>
    </div>
  );
}
