import { useState } from 'react';
import { api, errorMessage } from '../../api/client.js';
import { dateTime, longDate, titleCase } from '../../lib/format.js';
import { Avatar, Badge, Button, Card, Empty, LoadState, PageHeader, useLoad, useToast, cx } from '../../components/ui.jsx';
import { ROLE_LABEL } from '../../components/Layout.jsx';

// "kyc.document_uploaded" → "KYC · document uploaded"
const readable = action => { const [area, ...rest] = String(action || '').split('.'); return `${titleCase(area)} · ${titleCase(rest.join(' ')).toLowerCase()}`; };
const details = meta => Object.entries(meta || {}).map(([key, value]) => `${titleCase(key)}: ${typeof value === 'object' ? JSON.stringify(value) : value}`).join(' · ');

export default function OpsAudit() {
  const toast = useToast();
  const [tab, setTab] = useState('audit');
  const [filter, setFilter] = useState('');
  const [limit, setLimit] = useState(50);
  const audit = useLoad(async () => (await api.get('/ops/audit', { params: { action: filter || undefined } })).data.entries, [filter]);
  const requests = useLoad(async () => (await api.get('/ops/data-requests')).data.requests);
  const complete = async id => { try { await api.post(`/ops/data-requests/${id}/complete`); toast('Marked complete'); await requests.reload(true); } catch (error) { toast(errorMessage(error), 'error'); } };
  return (
    <div className="">
      <PageHeader eyebrow="Privacy & security" title="Audit log and data requests" subtitle="Every login, consent, document view, KYC decision and price change is recorded. Owners' DPDP requests are tracked against a 30-day deadline." />
      <div className="mb-4 flex flex-wrap gap-2">{[['audit', 'Audit log'], ['requests', 'Data requests']].map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={cx('chip', tab === key && 'border-ink bg-ink text-white hover:text-white')}>{label}</button>)}{tab === 'audit' && <select className="input w-auto py-2 text-sm" value={filter} onChange={event => setFilter(event.target.value)}><option value="">All actions</option>{['login', 'consent', 'kyc', 'privacy', 'catalogue', 'user', 'job'].map(prefix => <option key={prefix} value={prefix}>{titleCase(prefix)}</option>)}</select>}</div>
      {tab === 'audit' ? (
        <LoadState state={audit}>
          {entries => entries.length ? <Card className="scroll-x"><table className="table"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Detail</th></tr></thead><tbody>{entries.slice(0, limit).map(entry => <tr key={entry.id}><td className="whitespace-nowrap text-xs">{dateTime(entry.at)}</td><td><div className="flex items-center gap-2.5"><Avatar name={entry.actor || 'System'} size="sm" /><div>{entry.actor || 'System'}<p className="text-xs text-ink-muted">{ROLE_LABEL[entry.role] || titleCase(entry.role)}</p></div></div></td><td className="whitespace-nowrap">{readable(entry.action)}</td><td className="text-xs text-ink-muted">{entry.target} {entry.targetId?.slice(-6)}</td><td className="max-w-xs text-xs text-ink-muted">{details(entry.meta)}</td></tr>)}</tbody></table>{entries.length > limit && <div className="border-t border-line p-3 text-center"><Button size="sm" variant="secondary" onClick={() => setLimit(limit + 50)}>Show {Math.min(50, entries.length - limit)} more of {entries.length - limit}</Button></div>}</Card> : <Card><Empty title="No entries" /></Card>}
        </LoadState>
      ) : (
        <LoadState state={requests}>
          {rows => rows.length ? <Card className="scroll-x"><table className="table"><thead><tr><th>Request</th><th>From</th><th>Note</th><th>Due</th><th>Status</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td className="font-semibold">{titleCase(row.type)}</td><td>{row.user}</td><td className="text-sm text-ink-muted">{row.note || '—'}</td><td className="text-sm">{longDate(row.dueBy)}</td><td>{row.status === 'completed' ? <Badge tone="green">{{ erased: 'Completed · erased', retained_legal: 'Completed · KYC kept (live service)', nothing_held: 'Completed · nothing held' }[row.outcome] || 'Completed'}</Badge> : <Button size="sm" variant="secondary" onClick={() => complete(row.id)}>{row.type === 'erasure' ? 'Erase and complete' : 'Mark complete'}</Button>}</td></tr>)}</tbody></table></Card> : <Card><Empty title="No data requests" /></Card>}
        </LoadState>
      )}
    </div>
  );
}
