import { useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../../api/client.js';
import { timeAgo, titleCase } from '../../lib/format.js';
import { Badge, Card, Empty, LoadState, Meter, PageHeader, STATUS_TONE, useLoad, useToast, cx } from '../../components/ui.jsx';
import { CASE_LABEL, CASE_TONE } from '../partner/PartnerQueue.jsx';

export default function OpsCases() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const kind = params.get('kind') || '';
  const status = params.get('status') || 'open';
  const state = useLoad(async () => (await api.get('/ops/cases', { params: { kind: kind || undefined, status: status === 'resolved' ? 'resolved' : undefined } })).data, [kind, status]);
  const assign = async (id, userId) => { try { await api.post(`/ops/cases/${id}/assign`, { userId }); toast('Reassigned; partner notified'); await state.reload(true); } catch (error) { toast(errorMessage(error), 'error'); } };
  const set = (key, value) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next); };
  return (
    <div className="">
      <PageHeader eyebrow="Operations" title="Partner cases" subtitle="Routed automatically by city, then state, then language, then lightest load. Reassign when needed." />
      <div className="mb-4 flex flex-wrap gap-2">{['open', 'resolved'].map(option => <button key={option} onClick={() => set('status', option)} className={cx('chip', status === option && 'border-ink bg-ink text-white hover:text-white')}>{titleCase(option)}</button>)}<select className="input w-auto py-2 text-sm" value={kind} onChange={event => set('kind', event.target.value)}><option value="">All reasons</option>{Object.entries(CASE_LABEL).filter(([key]) => key !== 'lead').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
      <LoadState state={state}>
        {data => data.cases.length ? (
          <Card className="scroll-x"><table className="table"><thead><tr><th>Case</th><th>Reason</th><th>City</th><th>Status</th><th>Partner</th></tr></thead>
            <tbody>{data.cases.map(item => <tr key={item.id}><td><Badge tone={CASE_TONE[item.kind]}>{CASE_LABEL[item.kind]}</Badge><p className="mt-1 font-semibold">{item.title}</p><p className={cx('text-xs', item.overdue ? 'font-medium text-brand-700' : 'text-ink-muted')}>{timeAgo(item.createdAt)}{item.overdue && ' · past 24 h'}</p>{item.status === 'open' && <Meter value={(Date.now() - new Date(item.createdAt)) / 36e5} max={24} tone={item.overdue ? 'red' : 'amber'} className="mt-1.5 max-w-[10rem]" label="Time used of the 24-hour target" />}</td><td className="max-w-xs text-sm text-ink-muted">{item.reason}</td><td>{item.city || '—'}</td><td><Badge tone={STATUS_TONE[item.status]}>{titleCase(item.status)}</Badge></td><td><select className="input py-1.5 text-sm" value={item.assignedId || ''} onChange={event => assign(item.id, event.target.value)}><option value="" disabled>Unassigned</option>{data.partners.map(partner => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select></td></tr>)}</tbody></table></Card>
        ) : <Card><Empty title="No cases" /></Card>}
      </LoadState>
    </div>
  );
}
