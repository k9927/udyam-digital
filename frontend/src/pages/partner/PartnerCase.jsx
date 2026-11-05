import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Phone, Send, CheckCircle2, UserCheck, Lightbulb } from 'lucide-react';
import { api, errorMessage } from '../../api/client.js';
import { rupees, dateTime, titleCase } from '../../lib/format.js';
import { Avatar, Badge, Button, Callout, Card, Field, LoadState, PageHeader, STATUS_TONE, useLoad, useToast } from '../../components/ui.jsx';
import { CASE_LABEL, CASE_TONE } from './PartnerQueue.jsx';

const OUTCOMES = [['called', 'Called and helped'], ['no_answer', 'No answer'], ['helped', 'Resolved the issue'], ['not_interested', 'Not interested']];

export default function PartnerCase() {
  const { id } = useParams();
  const toast = useToast();
  const [form, setForm] = useState({ outcome: 'called', note: '', resolve: false });
  const [busy, setBusy] = useState('');
  const state = useLoad(async () => (await api.get(`/partner/cases/${id}`)).data.case, [id]);
  const act = async (key, request, message) => {
    setBusy(key);
    try { const { data } = await request(); state.setData(data.case); toast(message); } catch (error) { toast(errorMessage(error), 'error'); } finally { setBusy(''); }
  };
  return (
    <LoadState state={state}>
      {item => (
        <div className="">
          <PageHeader eyebrow={CASE_LABEL[item.kind]} title={item.title} subtitle={item.reason} actions={<><Badge tone={STATUS_TONE[item.status]}>{titleCase(item.status)}</Badge>{!item.assignedTo && <Button size="sm" loading={busy === 'claim'} onClick={() => act('claim', () => api.post(`/partner/cases/${id}/claim`), 'Case claimed')}><UserCheck className="h-4 w-4" />Take this case</Button>}</>} />
          <div className="grid items-start gap-6 lg:grid-cols-[1.3fr_1fr]">
            <div className="space-y-4">
              <Callout tone="info"><p className="flex items-center gap-2 text-sm font-medium text-sky-900"><Lightbulb className="h-4 w-4" />Suggested next step</p><p className="mt-1.5 text-[15px]">{item.nextStep}</p></Callout>
              {item.contact && <Card className="flex flex-wrap items-center gap-4 p-5"><Avatar name={item.contact.name} size="lg" /><div className="flex-1"><p className="font-semibold">{item.contact.name}</p><p className="num font-mono text-lg">{item.contact.phone}</p></div><a href={`tel:${item.contact.phone}`} className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-ok-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-ok-700 sm:w-auto"><Phone className="h-4 w-4" />Call · {item.language}</a></Card>}
              {item.business && (
                <Card className="p-5">
                  <p className="eyebrow mb-2">Customer</p>
                  <div className="flex items-center gap-3"><Avatar name={item.business.name} /><p className="text-lg font-semibold">{item.business.name}</p></div>
                  <p className="text-sm text-ink-muted">{[item.business.city, item.business.state].filter(Boolean).join(', ')} · prefers {item.language}</p>
                  <div className="mt-3 flex flex-wrap gap-2"><Badge tone={STATUS_TONE[item.business.kycStatus]}>Business verification: {titleCase(item.business.kycStatus).toLowerCase()}</Badge>{item.business.gst && <Badge>GSTIN {item.business.gst}</Badge>}{item.business.udyam && <Badge>Udyam {item.business.udyam}</Badge>}</div>
                  {item.business.failed?.length > 0 && <ul className="mt-3 space-y-1.5">{item.business.failed.map((failure, index) => <li key={index} className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800"><span className="font-semibold">{failure.type}:</span> {failure.label}{failure.detail && <span className="block text-xs opacity-80">{failure.detail}</span>}</li>)}</ul>}
                </Card>
              )}
              {item.order && <Card className="p-5"><p className="eyebrow mb-2">Order</p><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{item.order.ref} · {item.order.bundleName}</p><Badge tone={STATUS_TONE[item.order.status]}>{titleCase(item.order.status)}</Badge></div><p className="mt-1 text-sm text-ink-muted">{rupees(item.order.monthly)}/month{item.order.slot?.date ? ` · install ${item.order.slot.date} ${item.order.slot.window}` : ''}</p></Card>}
              {item.quote && <Card className="p-5"><p className="eyebrow mb-2">Saved quote</p><p className="font-semibold">{item.quote.bundleName}</p><p className="text-sm text-ink-muted">{rupees(item.quote.monthly)}/month · saved {dateTime(item.quote.savedAt)}</p></Card>}
            </div>
            <div className="space-y-4">
              <Card className="p-5">
                <p className="eyebrow mb-3">Log what happened</p>
                <form className="space-y-3" onSubmit={event => { event.preventDefault(); act('log', () => api.post(`/partner/cases/${id}/log`, form), form.resolve ? 'Case resolved' : 'Logged'); setForm({ ...form, note: '' }); }}>
                  <div className="grid grid-cols-2 gap-2">{OUTCOMES.map(([value, label]) => <label key={value} className={`cursor-pointer rounded-md border px-3 py-2 text-sm font-semibold ${form.outcome === value ? 'border-ink bg-ink text-white' : 'border-line'}`}><input type="radio" className="sr-only" checked={form.outcome === value} onChange={() => setForm({ ...form, outcome: value })} />{label}</label>)}</div>
                  <Field label="Note"><textarea className="input min-h-20" value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} /></Field>
                  <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-4 w-4 accent-ink" checked={form.resolve} onChange={event => setForm({ ...form, resolve: event.target.checked })} />Mark resolved</label>
                  <Button type="submit" className="w-full" loading={busy === 'log'}><CheckCircle2 className="h-4 w-4" />Save</Button>
                </form>
                {item.business && <Button variant="secondary" className="mt-3 w-full" loading={busy === 'link'} onClick={() => act('link', () => api.post(`/partner/cases/${id}/send-link`), 'Link sent to the customer')}><Send className="h-4 w-4" />Send the customer a link to continue</Button>}
                <p className="mt-2 text-xs text-ink-muted">The customer still gives consent and verifies on their own phone.</p>
              </Card>
              <Card className="p-5"><p className="eyebrow mb-3">History</p>{item.notes?.length ? <ul className="space-y-2.5">{[...item.notes].reverse().map((note, index) => <li key={index} className="text-sm"><p>{note.text}</p><p className="text-xs text-ink-faint">{dateTime(note.at)} · {titleCase(note.outcome)}</p></li>)}</ul> : <p className="text-sm text-ink-muted">No activity yet.</p>}<p className="mt-3 border-t border-line pt-3 text-xs text-ink-muted">Priority score {item.priority}/100</p></Card>
            </div>
          </div>
        </div>
      )}
    </LoadState>
  );
}
