import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api, errorMessage } from '../../api/client.js';
import { useLanguage, LANGUAGES } from '../../i18n/index.jsx';
import { dateTime, longDate } from '../../lib/format.js';
import { Avatar, Badge, Button, Card, Field, LoadState, PageHeader, useLoad, useToast } from '../../components/ui.jsx';

export default function MyData() {
  const { t } = useLanguage();
  const toast = useToast();
  const [type, setType] = useState('access');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const state = useLoad(async () => (await api.get('/me/data')).data);
  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    try { const { data } = await api.post('/me/data-requests', { type, note }); toast(t('data.due', { date: longDate(data.request.dueBy) })); setNote(''); await state.reload(true); } catch (error) { toast(errorMessage(error), 'error'); } finally { setBusy(false); }
  };
  return (
    <LoadState state={state}>
      {data => (
        <div className="space-y-6">
          <PageHeader title={t('data.title')} subtitle={t('data.subtitle')} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5"><div className="mb-4 flex items-center gap-3"><Avatar name={data.account.name || 'Owner'} /><div><p className="font-medium">{data.account.name || '—'}</p><p className="text-sm text-ink-muted">{data.business?.name !== 'My business' ? data.business?.name : ''}</p></div></div><dl className="space-y-1.5 border-t border-line pt-3 text-sm"><div className="flex justify-between"><dt className="text-ink-muted">Name</dt><dd>{data.account.name || '—'}</dd></div><div className="flex justify-between"><dt className="text-ink-muted">Mobile</dt><dd>{data.account.phone}</dd></div><div className="flex justify-between"><dt className="text-ink-muted">Language</dt><dd>{LANGUAGES.find(([code]) => code === data.account.language)?.[1] || data.account.language}</dd></div>{data.business && <><div className="flex justify-between"><dt className="text-ink-muted">Business</dt><dd>{data.business.name === 'My business' ? '—' : data.business.name}</dd></div><div className="flex justify-between"><dt className="text-ink-muted">GSTIN</dt><dd>{data.business.gst || '—'}</dd></div><div className="flex justify-between"><dt className="text-ink-muted">Udyam</dt><dd>{data.business.udyam || '—'}</dd></div><div className="flex justify-between"><dt className="text-ink-muted">{t('dash.verification')}</dt><dd>{t(`kycs.${data.business.kycStatus}`)}</dd></div></>}<div className="flex justify-between"><dt className="text-ink-muted">Orders / quotes</dt><dd>{data.counts.orders} / {data.counts.quotes}</dd></div></dl></Card>
            <Card className="p-5"><p className="eyebrow mb-3">{t('data.documents')}</p>{data.documents.length ? <ul className="space-y-2 text-sm">{data.documents.map(doc => <li key={doc.type} className="rounded-lg bg-paper px-3 py-2"><p className="font-semibold">{t(`doc.${doc.type}`)} <span className="text-xs font-normal text-ink-faint">{dateTime(doc.uploadedAt)} · {doc.storage === 'r2' ? 'Cloudflare R2' : 'private storage'}</span></p><p className="text-xs text-ink-muted">{doc.retention}</p></li>)}</ul> : <p className="text-sm text-ink-muted">—</p>}</Card>
          </div>
          <Card className="p-5"><p className="eyebrow mb-3">{t('data.consents')}</p>{!data.consents.length && <p className="text-sm text-ink-muted">—</p>}<ul className="space-y-2 text-sm">{data.consents.map((consent, index) => <li key={index} className="flex flex-wrap items-center gap-2 rounded-lg bg-paper px-3 py-2"><ShieldCheck className="h-4 w-4 text-ok-600" /><span className="flex-1">{consent.purpose}</span><span className="text-xs text-ink-muted">{dateTime(consent.grantedAt)}</span>{consent.withdrawnAt ? <Badge>Withdrawn</Badge> : new Date(consent.expiresAt) > new Date() ? <Badge tone="green">Active</Badge> : <Badge>Expired</Badge>}</li>)}</ul></Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5"><form onSubmit={submit} className="space-y-3"><p className="eyebrow">{t('data.requests')}</p><div className="grid gap-2 sm:grid-cols-3">{['access', 'correction', 'erasure'].map(option => <label key={option} className={`cursor-pointer rounded-md border px-3 py-2 text-sm font-semibold ${type === option ? 'border-ink bg-ink text-white' : 'border-line'}`}><input type="radio" className="sr-only" checked={type === option} onChange={() => setType(option)} />{t(`data.${option}`)}</label>)}</div><Field label={t('data.note')}><textarea className="input min-h-20" value={note} onChange={event => setNote(event.target.value)} /></Field><Button type="submit" loading={busy}>{t('data.submit')}</Button></form></Card>
            <Card className="p-5"><p className="eyebrow mb-3">{t('data.requests')}</p>{data.requests.length ? <ul className="space-y-2 text-sm">{data.requests.map(request => <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-paper px-3 py-2"><span>{t(`data.${request.type}`)}{request.outcome && <span className="block text-xs text-ink-muted">{t(`data.outcome.${request.outcome}`)}</span>}</span><span className="text-xs text-ink-muted">{t('data.due', { date: longDate(request.dueBy) })}</span><Badge tone={request.status === 'completed' ? 'green' : 'amber'}>{request.status}</Badge></li>)}</ul> : <p className="text-sm text-ink-muted">—</p>}</Card>
          </div>
        </div>
      )}
    </LoadState>
  );
}
