import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock, Inbox } from 'lucide-react';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { timeAgo, titleCase } from '../../lib/format.js';
import { Avatar, Badge, Card, Empty, LoadState, Meter, PageHeader, Stat, useLoad, cx } from '../../components/ui.jsx';

export const CASE_LABEL = { callback: 'Callback requested', kyc_help: 'Documents need attention', payment_failed: 'Payment failed', abandoned_quote: 'Quote not ordered', sla_risk: 'Running late', cancelled: 'Cancelled order', no_registration: 'Needs GST/Udyam help', lead: 'Stalled lead' };
export const CASE_TONE = { callback: 'red', payment_failed: 'red', sla_risk: 'red', kyc_help: 'amber', abandoned_quote: 'blue', cancelled: 'neutral', no_registration: 'amber' };

export default function PartnerQueue() {
  const { user } = useAuth();
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('open');
  const state = useLoad(async () => (await api.get('/partner/cases', { params: { status: status === 'resolved' ? 'resolved' : undefined } })).data, [status]);
  return (
    <div className="">
      <PageHeader eyebrow="Partner app" title="Customers who need a person" subtitle="Everything the digital journey could not close on its own, highest priority first. Call in the customer's language, then log what happened." />
      <LoadState state={state}>
        {data => {
          const cases = data.cases.filter(item => !kind || item.kind === kind);
          const mine = data.cases.filter(item => item.assignedTo === user.id).length;
          return (
            <>
              <div className="mb-5 grid gap-3 sm:grid-cols-3"><Stat label="Open cases" value={data.cases.length} hint={`${mine} assigned to you`} /><Stat label="Overdue" value={data.cases.filter(item => item.overdue).length} tone="red" hint="Past the 24-hour target" /><Stat label="Callbacks" value={data.counts.callback || 0} hint="Owners waiting for a call" /></div>
              <div className="mb-4 flex flex-wrap gap-2">
                {['open', 'resolved'].map(option => <button key={option} onClick={() => setStatus(option)} className={cx('chip', status === option && 'border-ink bg-ink text-white hover:text-white')}>{titleCase(option)}</button>)}
                <span className="mx-1 w-px bg-line" />
                <button onClick={() => setKind('')} className={cx('chip', !kind && 'border-ink bg-ink text-white hover:text-white')}>All</button>
                {Object.entries(data.counts).filter(([key]) => key !== 'lead').map(([key, count]) => <button key={key} onClick={() => setKind(key)} className={cx('chip', kind === key && 'border-ink bg-ink text-white hover:text-white')}>{CASE_LABEL[key]} · {count}</button>)}
              </div>
              {cases.length ? (
                <Card className="divide-y divide-line">{cases.map(item => (
                  <Link key={item.id} to={`/partner/cases/${item.id}`} className="flex flex-col gap-3 p-4 hover:bg-paper/60 sm:flex-row sm:items-center">
                    <Avatar name={item.business?.name || item.title} className="hidden sm:grid" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><Badge tone={CASE_TONE[item.kind]}>{CASE_LABEL[item.kind]}</Badge>{item.overdue && <Badge tone="red"><Clock className="h-3 w-3" />Overdue</Badge>}{!item.assignedTo && <Badge tone="blue">Unclaimed</Badge>}<span className="text-xs text-ink-faint">{timeAgo(item.createdAt)}</span></div>
                      <p className="mt-1 font-semibold">{item.title}</p>
                      <p className="text-sm text-ink-muted">{item.reason}</p>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-ink-muted">
                      {status === 'open' && <div className="w-28"><p className={cx('text-right text-xs', item.overdue && 'font-medium text-brand-700')}>{item.overdue ? 'Past 24 h' : `${Math.max(0, 24 - Math.round((Date.now() - new Date(item.createdAt)) / 36e5))} h left`}</p><Meter value={(Date.now() - new Date(item.createdAt)) / 36e5} max={24} tone={item.overdue ? 'red' : 'amber'} className="mt-1" label="Time used of the 24-hour target" /></div>}
                      <span className="text-right">{item.city || '—'}<span className="block text-xs">{item.language}</span></span><ArrowRight className="h-4 w-4" />
                    </div>
                  </Link>
                ))}</Card>
              ) : <Card><Empty icon={Inbox} title="Nothing waiting">New cases appear here as soon as a customer asks for help or gets stuck.</Empty></Card>}
            </>
          );
        }}
      </LoadState>
    </div>
  );
}
