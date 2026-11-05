import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Minus, Plus, X, Lock, ArrowRight } from 'lucide-react';
import { api, errorMessage, rememberQuoteToken } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../i18n/index.jsx';
import { rupees, quantityLabel } from '../../lib/format.js';
import { Alert, Badge, Button, Card, Spinner, useToast, cx } from '../../components/ui.jsx';

function Line({ label, value, strong }) {
  return <div className={cx('flex justify-between py-1.5 text-sm', strong ? 'mt-1 border-t border-line pt-3 font-semibold text-ink' : 'text-ink-muted')}><span>{label}</span><span className={cx('num', !strong && 'text-ink')}>{value}</span></div>;
}

export default function Quote() {
  const { id } = useParams();
  const [params] = useSearchParams();
  // A quote shared by link (e.g. from WhatsApp) carries its access token; keep it before the first fetch.
  const sharedToken = params.get('t');
  if (sharedToken) rememberQuoteToken(id, sharedToken);
  const { user, refresh } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const navigate = useNavigate();
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [budget, setBudget] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let { data } = await api.get(`/quotes/${id}`);
        if (params.get('save') && user?.role === 'customer' && data.quote.status === 'draft') ({ data } = await api.post(`/quotes/${id}/save`));
        if (alive) { setQuote(data.quote); setBudget(data.quote.budget ? String(data.quote.budget) : ''); }
      } catch (err) { if (alive) setError(errorMessage(err)); }
    })();
    return () => { alive = false; };
  }, [id, params, user]);

  const patch = async body => {
    setBusy(true);
    try { setQuote((await api.patch(`/quotes/${id}`, body)).data.quote); } catch (err) { toast(errorMessage(err), 'error'); } finally { setBusy(false); }
  };

  const proceed = async () => {
    if (!user) { navigate(`/login?next=${encodeURIComponent(`/quote/${id}?save=1`)}`); return; }
    if (user.role !== 'customer') { toast('Sign in as a business owner to order.', 'error'); return; }
    setBusy(true);
    try {
      if (quote.status === 'draft') await api.post(`/quotes/${id}/save`);
      const { data } = await api.post('/orders', { quoteId: id });
      await refresh();
      navigate(`/app/orders/${data.order.id}`);
    } catch (err) { toast(errorMessage(err), 'error'); } finally { setBusy(false); }
  };

  if (error) return <div className="mx-auto max-w-md px-4 py-16 text-center"><h1 className="text-xl font-semibold">This quote is not available</h1><p className="mt-2 text-ink-muted">The link may have expired, or the quote was made on another phone. Saved quotes are in your account.</p><div className="mt-6 flex justify-center gap-2"><Button to="/login" variant="secondary">{t('nav.signIn')}</Button><Button to="/advisor">{t('nav.find')}</Button></div></div>;
  if (!quote) return <Spinner />;
  const { result } = quote;
  const totals = result.totals;
  const quantity = (productId, delta) => { const item = result.items.find(line => line.productId === productId) || result.addons.find(line => line.productId === productId); patch({ quantities: { [productId]: Math.max(1, Math.min(25, item.quantity + delta)) } }); };
  const toggle = productId => patch({ enabledAddons: result.enabledAddons.includes(productId) ? result.enabledAddons.filter(item => item !== productId) : [...result.enabledAddons, productId] });
  const notes = result.notes.filter(note => note.code !== 'gst_unlocks');
  const unlock = result.notes.find(note => note.code === 'gst_unlocks');
  const ordered = quote.status === 'ordered';

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:py-10 lg:pb-10">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm text-ink-muted">{t('quote.eyebrow')}</p><h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{result.bundleName}</h1><p className="mt-1.5 max-w-2xl text-ink-muted">{result.summary}</p></div>
        <div className="flex items-center gap-4">{quote.verification?.status === 'verified' && <Badge tone="green">{t('quote.verified', { tier: t(`tier.${quote.verification.tier}`) })}</Badge>}{!ordered && <Button variant="secondary" size="sm" to="/advisor">{t('quote.edit')}</Button>}</div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Card className="divide-y divide-line">
            <h2 className="px-5 py-4 text-base font-semibold">{t('quote.recommended')}</h2>
            {result.items.map(item => (
              <div key={item.productId} className="grid gap-3 p-5 sm:grid-cols-[1fr_auto]">
                <div><p className="font-medium">{item.name}</p><p className="mt-1 text-sm text-ink-soft">{item.why}</p><p className="mt-1 text-xs text-ink-muted">{t('quote.min', { n: item.months })} · {item.category}</p></div>
                <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                  <p className="num font-semibold">{rupees(item.monthly)}<span className="text-xs font-normal text-ink-muted">{t('common.perMonth')}</span></p>
                  {!ordered && <div className="flex items-center gap-2"><button className="grid h-9 w-9 place-items-center rounded-md border border-[#cfcfca] hover:border-ink disabled:opacity-40" disabled={busy || item.quantity <= 1} onClick={() => quantity(item.productId, -1)} aria-label="Decrease"><Minus className="h-3.5 w-3.5" /></button><span className="min-w-14 text-center text-sm">{quantityLabel(item.quantity, item.unit)}</span><button className="rounded-md border border-[#cfcfca] p-1.5 hover:border-ink disabled:opacity-40" disabled={busy} onClick={() => quantity(item.productId, 1)} aria-label="Increase"><Plus className="h-3.5 w-3.5" /></button>{!['P01', 'P02', 'P03', 'P04', 'P05', 'P06'].includes(item.productId) && <button className="grid h-9 w-9 place-items-center rounded-md text-ink-faint hover:bg-ink/5 hover:text-ink" onClick={() => patch({ removed: [...new Set([...(quote.removed || []), item.productId])] })} aria-label={t('quote.remove')} title={t('quote.remove')}><X className="h-4 w-4" /></button>}</div>}
                </div>
              </div>
            ))}
          </Card>

          {result.addons.length > 0 && !ordered && (
            <Card className="divide-y divide-line">
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4"><h2 className="text-base font-semibold">{t('quote.addons')}</h2><span className="text-sm text-ink-muted">{t('quote.addonsHint')}</span></div>
              {result.addons.map(addon => (
                <label key={addon.productId} className="flex cursor-pointer items-center gap-4 px-5 py-4 hover:bg-paper/60">
                  <input type="checkbox" className="h-4 w-4 accent-ink" checked={addon.enabled} disabled={busy} onChange={() => toggle(addon.productId)} />
                  <div className="flex-1"><p className="font-medium">{addon.name}</p><p className="text-sm text-ink-muted">{addon.why}</p></div>
                  <span className="num text-sm font-medium">+{rupees(addon.monthly)}</span>
                </label>
              ))}
            </Card>
          )}

          {(notes.length > 0 || unlock) && (
            <div className="space-y-2">
              {notes.map(note => <Alert key={note.code + note.text} tone={note.code.startsWith('budget') || note.code.startsWith('requested_') && note.code !== 'requested_added' ? 'warning' : 'info'}>{note.text}</Alert>)}
              {unlock && <Alert tone="info" title={t('quote.locked')}>{unlock.text} <Link className="font-semibold underline" to="/app/kyc">{t('dash.verifyNow')}</Link></Alert>}
            </div>
          )}
        </div>

        <Card className="border-t-[3px] border-t-brand-600 p-5 lg:sticky lg:top-20">
          <p className="text-sm text-ink-muted">{t('quote.estimated')}</p>
          <p className="num mt-1"><span className="text-4xl font-semibold">{rupees(totals.monthly)}</span> <span className="text-sm text-ink-muted">{t('common.perMonth')} · {t('common.inclGst')}</span></p>
          <p className="mt-1 text-xs text-ink-muted">{t('quote.range')}: {rupees(totals.subtotal)}–{rupees(totals.subtotalMax)}</p>
          <div className="mt-4"><Line label={t('quote.subtotal')} value={rupees(totals.subtotal)} /><Line label={t('quote.gst')} value={rupees(totals.tax)} /><Line label={t('quote.setup')} value={rupees(totals.setup)} /><Line label={t('quote.setupGst')} value={rupees(totals.setupTax)} /><Line label={t('quote.dueNow')} value={rupees(totals.dueNow)} strong /><Line label={t('quote.commitment')} value={t('common.months', { n: totals.commitmentMonths })} /></div>
          <p className="mt-3 text-sm text-ink-soft">{t('quote.install', { n: totals.installDays })}</p>
          {result.spendComparison !== null && <p className={cx('mt-1 text-sm', result.spendComparison >= 0 ? 'text-ok-700' : 'text-warn-700')}>{result.spendComparison >= 0 ? t('quote.save', { amount: rupees(result.spendComparison) }) : t('quote.more', { amount: rupees(-result.spendComparison) })}</p>}
          {!ordered && (
            <form className="mt-4 flex gap-2" onSubmit={event => { event.preventDefault(); patch({ budget: budget ? Number(budget) : null }); }}>
              <label className="flex-1"><span className="sr-only">{t('quote.budgetLabel')}</span><input className="input py-2 text-sm" inputMode="numeric" placeholder={t('quote.budgetLabel')} value={budget} onChange={event => setBudget(event.target.value.replace(/\D/g, ''))} /></label>
              <Button type="submit" variant="secondary" size="sm" disabled={busy}>{t('quote.apply')}</Button>
            </form>
          )}
          {!ordered ? (
            <>
              <Button className="mt-4 w-full" size="lg" loading={busy} onClick={proceed}>{user ? t('quote.placeOrder') : t('quote.saveContinue')}<ArrowRight className="h-5 w-5" /></Button>
              {!user && <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-ink-muted"><Lock className="h-3.5 w-3.5" />{t('quote.signInNote')}</p>}
            </>
          ) : <Button className="mt-4 w-full" variant="secondary" to="/app">{t('nav.myBusiness')}</Button>}
        </Card>
        {!ordered && (
          <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-line bg-white px-4 py-3 shadow-pop lg:hidden">
            <p className="num flex-1"><span className="text-lg font-semibold">{rupees(totals.monthly)}</span><span className="text-xs text-ink-muted">{t('common.perMonth')}</span></p>
            <Button loading={busy} onClick={proceed}>{user ? t('quote.placeOrder') : t('quote.saveContinue')}<ArrowRight className="h-4 w-4" /></Button>
          </div>
        )}
      </div>
    </div>
  );
}
