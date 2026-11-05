import { useState } from 'react';
import { Search } from 'lucide-react';
import { api, errorMessage } from '../../api/client.js';
import { rupees, titleCase } from '../../lib/format.js';
import { Badge, Button, Card, LoadState, PageHeader, Stat, useLoad, useToast, cx } from '../../components/ui.jsx';

const SEGMENTS = ['Micro retail & services', 'Professional offices', 'Small multi-site businesses', 'Small manufacturers'];

export default function PartnerLeads() {
  const toast = useToast();
  const [filters, setFilters] = useState({ q: '', segment: '', scope: 'region' });
  const [query, setQuery] = useState(filters);
  const pick = (key, value) => { const next = { ...filters, [key]: value }; setFilters(next); setQuery(next); };
  const state = useLoad(async () => (await api.get('/partner/leads', { params: query })).data, [query.q, query.segment, query.scope]);
  const claim = async (lead, outcome) => {
    try { await api.post(`/partner/leads/${lead.id}/claim`, { outcome }); toast(outcome === 'claimed' ? `${lead.leadId} is yours` : 'Outcome saved'); await state.reload(true); } catch (error) { toast(errorMessage(error), 'error'); }
  };
  return (
    <div className="">
      <PageHeader eyebrow="Recovery queue" title="Stalled leads most likely to convert" subtitle="Ranked by how likely each lead is to convert: a model trained on last quarter's 5,000 leads (business profile only), adjusted for how far the lead got and whether its drop reason is easy to fix. Names and numbers stay hidden until you claim a lead." />
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]" onSubmit={event => { event.preventDefault(); setQuery(filters); }}>
        <label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-ink-faint" /><input className="input pl-9" placeholder="City, business type, stage or reason" value={filters.q} onChange={event => setFilters({ ...filters, q: event.target.value })} /></label>
        <select className="input" value={filters.segment} onChange={event => pick('segment', event.target.value)}><option value="">All segments</option>{SEGMENTS.map(segment => <option key={segment}>{segment}</option>)}</select>
        <select className="input" value={filters.scope} onChange={event => pick('scope', event.target.value)}><option value="region">My region</option><option value="all">All India</option><option value="mine">Claimed by me</option></select>
        <Button type="submit" variant="dark">Search</Button>
      </form>
      <LoadState state={state}>
        {data => (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-2"><Stat label="Matching leads" value={data.total.toLocaleString('en-IN')} /><Stat label="Top 10% priority" value={data.highPriority.toLocaleString('en-IN')} hint="Score 90+" tone="red" /></div>
            <Card className="scroll-x">
              <table className="table">
                <thead><tr><th>Lead · priority</th><th>Business</th><th>Stage · why it stalled</th><th>Why ranked</th><th /></tr></thead>
                <tbody>{data.leads.map(lead => (
                  <tr key={lead.id}>
                    <td><p className="font-semibold">{lead.leadId}</p><p className="text-xs text-ink-muted">Priority {lead.score}/100 · {lead.probability}% likely</p><div className="mt-1.5 h-1.5 w-20 rounded-full bg-line"><div className={cx('h-full rounded-full', lead.score >= 90 ? 'bg-ok-600' : 'bg-warn-600')} style={{ width: `${lead.score}%` }} /></div></td>
                    <td><p className="font-semibold">{lead.businessType}</p><p className="text-xs text-ink-muted">{lead.segment}</p><p className="text-xs text-ink-muted">{lead.city} · <Badge>{lead.language}</Badge></p></td>
                    <td><p className="font-semibold">{lead.stage}</p><p className="text-xs text-ink-muted">{lead.dropReason || '—'}</p><p className="text-xs text-ink-muted">{lead.source} · {rupees(lead.monthlySpend)}/mo spend</p></td>
                    <td className="max-w-xs text-xs text-ink-muted">{lead.reasons.slice(1).join(' · ')}</td>
                    <td className="whitespace-nowrap">{lead.assignedToMe ? <div className="flex flex-col gap-1"><Badge tone="green">{titleCase(lead.followUp?.outcome || 'claimed')}</Badge><select className="input py-1 text-xs" value="" onChange={event => event.target.value && claim(lead, event.target.value)}><option value="">Log outcome…</option><option value="called">Called</option><option value="no_answer">No answer</option><option value="interested">Interested</option><option value="not_interested">Not interested</option><option value="converted">Converted</option></select></div> : lead.assigned ? <Badge>Claimed</Badge> : <Button size="sm" variant="secondary" onClick={() => claim(lead, 'claimed')}>Claim</Button>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </Card>
          </>
        )}
      </LoadState>
    </div>
  );
}
