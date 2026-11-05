import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PackageSearch } from 'lucide-react';
import { api, errorMessage } from '../../api/client.js';
import { useLanguage } from '../../i18n/index.jsx';
import { Alert, Badge, Button, Card, Field, STATUS_TONE } from '../../components/ui.jsx';
import Timeline from '../../components/Timeline.jsx';

export default function Track() {
  const { t } = useLanguage();
  const [params] = useSearchParams();
  const [form, setForm] = useState(() => ({ ref: (params.get('ref') || '').toUpperCase(), last4: (params.get('last4') || '').replace(/\D/g, '').slice(0, 4) }));
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async event => {
    event?.preventDefault();
    setBusy(true); setError('');
    try { setOrder((await api.get('/track', { params: form })).data.order); } catch (err) { setOrder(null); setError(errorMessage(err)); } finally { setBusy(false); }
  };
  useEffect(() => { if (!form.ref || form.last4.length !== 4) return undefined; const timer = setTimeout(submit, 0); return () => clearTimeout(timer); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6"><h1 className="text-2xl font-semibold sm:text-3xl">{t('track.title')}</h1><p className="mt-2 text-ink-muted">{t('track.subtitle')}</p></div>
      <Card className="p-5">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1.4fr_1fr_auto] sm:items-end">
          <Field label={t('track.ref')}><input className="input uppercase" required placeholder="UD-2611-XXXXX" value={form.ref} onChange={event => setForm({ ...form, ref: event.target.value.toUpperCase() })} /></Field>
          <Field label={t('track.last4')}><input className="input" required inputMode="numeric" maxLength={4} pattern="[0-9]{4}" value={form.last4} onChange={event => setForm({ ...form, last4: event.target.value.replace(/\D/g, '') })} /></Field>
          <Button type="submit" loading={busy}><PackageSearch className="h-4 w-4" />{t('track.submit')}</Button>
        </form>
      </Card>
      {error && <Alert tone="error" className="mt-4">{error}</Alert>}
      {order && (
        <Card className="mt-6 p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2"><div><p className="eyebrow">{order.bundleName}</p><h2 className="text-xl font-extrabold">{order.ref}</h2></div><Badge tone={STATUS_TONE[order.status]}>{t(`os.${order.status}`)}</Badge></div>
          <Timeline milestones={order.milestones} />
          {order.partner && <p className="mt-5 text-sm text-ink-muted">{t('order.partner', { name: order.partner })}</p>}
          <p className="mt-2 text-sm text-ink-muted">{t('order.noCalls')}</p>
        </Card>
      )}
    </div>
  );
}
