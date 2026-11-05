import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { api } from '../../api/client.js';
import { timeAgo, titleCase } from '../../lib/format.js';
import { Avatar, Badge, Card, Empty, LoadState, Meter, PageHeader, STATUS_TONE, useLoad, cx } from '../../components/ui.jsx';

export default function ReviewQueue() {
  const [tab, setTab] = useState('queue');
  const state = useLoad(async () => (await api.get('/review/queue', { params: { status: tab === 'decided' ? 'decided' : undefined } })).data.businesses, [tab]);
  return (
    <div className="">
      <PageHeader eyebrow="KYC officer" title="Applications that need a human look" subtitle="Automatic checks handle the rest. You only see what failed or looked unusual, side by side with the registry." />
      <div className="mb-4 flex gap-2">{[['queue', 'Waiting for review'], ['decided', 'Recently decided']].map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={cx('chip', tab === key && 'border-ink bg-ink text-white hover:text-white')}>{label}</button>)}</div>
      <LoadState state={state}>
        {rows => rows.length ? (
          <Card className="divide-y divide-line">{rows.map(row => (
            <Link key={row.id} to={`/review/${row.id}`} className="flex flex-col gap-3 p-4 hover:bg-paper/60 sm:flex-row sm:items-center">
              <Avatar name={row.name} className="hidden sm:grid" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{row.name}</p><Badge tone={STATUS_TONE[row.status]}>{titleCase(row.status)}</Badge>{row.ownerRequested && <Badge tone="blue">Owner asked for review</Badge>}{row.tier && <Badge>{{ gst: 'GST', udyam: 'Udyam', owner: 'Owner-verified (unregistered)' }[row.tier]}</Badge>}</div>
                <p className="text-sm text-ink-muted">{row.city} · waiting {row.waitingHours} h · {timeAgo(row.submittedAt)}</p>
                <ul className="mt-1 flex flex-wrap gap-1.5">{row.flags.map(flag => <li key={flag} className="rounded-md bg-brand-50 px-2 py-0.5 text-xs text-brand-800">{flag}</li>)}</ul>
              </div>
              {tab === 'queue' && <div className="w-32"><p className={cx('text-right text-xs', row.waitingHours >= 4 ? 'font-medium text-brand-700' : 'text-ink-muted')}>{row.waitingHours >= 4 ? 'Past 4 h promise' : `${4 - row.waitingHours} h to promise`}</p><Meter value={row.waitingHours} max={4} tone={row.waitingHours >= 4 ? 'red' : 'amber'} className="mt-1" label="Waiting time against the 4-hour promise" /></div>}
              <ArrowRight className="h-5 w-5 text-ink-faint" />
            </Link>
          ))}</Card>
        ) : <Card><Empty icon={ShieldCheck} title="All clear">No applications are waiting for review.</Empty></Card>}
      </LoadState>
    </div>
  );
}
