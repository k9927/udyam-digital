import { Link, useNavigate } from 'react-router-dom';
import { Plus, ArrowRight, CheckCircle2 } from 'lucide-react';
import { api, rememberQuoteToken, errorMessage } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../i18n/index.jsx';
import { rupees, shortDate, longDate } from '../../lib/format.js';
import { Avatar, Badge, Button, Callout, Empty, LoadState, Meter, ORDER_FLOW, STATUS_TONE, orderShare, orderTone, useLoad, useToast } from '../../components/ui.jsx';

// Statuses where the order waits on the owner, in the order they come up.
const OWNER_TURN = ['awaiting_kyc', 'awaiting_signature', 'awaiting_payment', 'awaiting_slot'];
const IN_FLIGHT = ['packing', 'ready_for_dispatch', 'out_for_delivery', 'delivered', 'installing', 'installed'];

export default function Dashboard() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const toast = useToast();
  const state = useLoad(async () => {
    const [business, orders, quotes, services] = await Promise.all([api.get('/business/me'), api.get('/orders/mine'), api.get('/quotes/mine'), api.get('/me/services')]);
    return { business: business.data.business, orders: orders.data.orders, quotes: quotes.data.quotes.filter(quote => quote.status === 'saved'), services: services.data };
  });
  const addMore = async baseOrderId => {
    try {
      const { data } = await api.post('/quotes', { mode: 'addon', baseOrderId, language });
      rememberQuoteToken(data.quote.id, data.accessToken);
      navigate(`/quote/${data.quote.id}`);
    } catch (error) { toast(errorMessage(error), 'error'); }
  };
  return (
    <LoadState state={state}>
      {({ business, orders, quotes, services }) => {
        const verified = business.kyc.status === 'verified';
        const firstActive = services.orders[0];
        const kycLabel = t(`kycs.${business.kyc.status === 'registry_needed' && business.registration?.path === 'unregistered' ? 'owner_needed' : business.kyc.status}`);
        // One thing to do next: an order waiting on the owner, then verification, then an order on its way.
        const mine = orders.filter(order => OWNER_TURN.includes(order.status)).sort((a, b) => OWNER_TURN.indexOf(a.status) - OWNER_TURN.indexOf(b.status))[0];
        const moving = orders.find(order => IN_FLIGHT.includes(order.status));
        const next = mine ? { title: mine.status === 'awaiting_kyc' ? t('order.waitingKyc') : t(`os.${mine.status}`), body: `${mine.bundleName} · ${mine.ref}`, to: mine.status === 'awaiting_kyc' ? '/app/kyc' : `/app/orders/${mine.id}`, cta: mine.status === 'awaiting_kyc' ? t('dash.verifyNow') : t('dash.open'), urgent: true, share: orderShare(mine.status) }
          : !verified ? { title: t('dash.verifyNow'), body: `${kycLabel} · ${t('dash.reuse')}`, to: '/app/kyc', cta: t('dash.verifyNow'), urgent: true }
            : moving ? { title: t(`os.${moving.status}`), body: `${moving.bundleName} · ${moving.ref}${moving.slot?.date ? ` · ${shortDate(moving.slot.date)} ${moving.slot.window}` : ''}`, to: `/app/orders/${moving.id}`, cta: t('dash.open'), share: orderShare(moving.status) }
              : null;
        return (
          <div className="space-y-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-center gap-4">
                <Avatar name={business.name === 'My business' ? user.name || 'Owner' : business.name} size="lg" />
                <div><h1 className="text-2xl font-semibold sm:text-[28px]">{business.name === 'My business' ? t('dash.hello', { name: user.name ? `, ${user.name}` : '' }) : business.name}</h1>{business.city && <p className="mt-0.5 text-ink-muted">{business.city}{business.state ? `, ${business.state}` : ''}</p>}</div>
              </div>
              <div className="flex flex-wrap gap-2">{firstActive && <Button variant="secondary" onClick={() => addMore(firstActive.id)}><Plus className="h-4 w-4" />{t('dash.addMore')}</Button>}<Button variant="secondary" to="/advisor"><Plus className="h-4 w-4" />{t('dash.new')}</Button></div>
            </div>

            <Callout tone={next?.urgent ? 'action' : next ? 'info' : 'ok'} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:p-6">
              <div className="flex-1">
                <p className="text-sm font-medium text-ink-soft">{t('dash.next')}</p>
                {next ? <><p className="mt-1 text-xl font-semibold">{next.title}</p><p className="mt-0.5 text-ink-soft">{next.body}</p>{next.share !== undefined && <Meter value={next.share} tone={orderTone(mine?.status || moving?.status)} className="mt-3 max-w-sm" label={next.title} />}</>
                  : <p className="mt-1 flex items-center gap-2 text-lg"><CheckCircle2 className="h-5 w-5 flex-none text-ok-600" />{t('dash.allGood')}</p>}
              </div>
              {next && <Button to={next.to} variant={next.urgent ? 'primary' : 'dark'} size="lg">{next.cta}<ArrowRight className="h-4 w-4" /></Button>}
            </Callout>

            <dl className="grid gap-6 sm:grid-cols-3">
              <div className="border-l-2 border-line pl-3">
                <dt className="text-sm text-ink-muted">{t('dash.verification')}</dt>
                <dd className="mt-1"><Badge tone={STATUS_TONE[business.kyc.status]} className="text-sm">{kycLabel}{business.kyc.tier ? ` · ${t(`tier.${business.kyc.tier}`)}` : ''}</Badge></dd>
                <dd className="mt-1 text-sm text-ink-muted">{verified && business.kyc.expiresAt ? `→ ${longDate(business.kyc.expiresAt)}` : null}</dd>
                {(business.gst || business.udyam) && <dd className="mt-1 text-sm text-ink-muted">{business.gst ? `GSTIN ${business.gst.masked}` : `Udyam ${business.udyam.masked}`}</dd>}
              </div>
              <div className="border-l-2 border-line pl-3">
                <dt className="text-sm text-ink-muted">{t('dash.services')}</dt>
                <dd className="num mt-1 text-2xl font-semibold">{services.services.length}</dd>
                <dd className="text-sm text-ink-muted">{services.monthly ? <Link to="/app/services" className="hover:text-ink">{rupees(services.monthly)}{t('common.perMonth')} · {t('common.inclGst')}</Link> : t('srv.empty')}</dd>
              </div>
              <div className="border-l-2 border-line pl-3">
                <dt className="text-sm text-ink-muted">{t('dash.quotes')}</dt>
                {quotes.length ? quotes.slice(0, 3).map(quote => <dd key={quote.id} className="mt-1 text-sm"><Link to={`/quote/${quote.id}`} className="flex justify-between gap-3 hover:underline"><span className="truncate">{quote.result.bundleName}</span><span className="num text-ink-muted">{rupees(quote.result.totals.monthly)}</span></Link></dd>) : <dd className="mt-1 text-2xl font-semibold">0</dd>}
              </div>
            </dl>

            <section>
              <h2 className="mb-3 text-lg font-semibold">{t('dash.orders')}</h2>
              {orders.length ? (
                <ul className="card divide-y divide-line">
                  {[...orders].sort((a, b) => (a.status === 'cancelled') - (b.status === 'cancelled')).map(order => (
                    <li key={order.id}><Link to={`/app/orders/${order.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-4 hover:bg-paper/60">
                      <div className="min-w-0 flex-1"><p className="font-medium">{order.bundleName}{order.kind === 'addon' && <span className="ml-2 text-sm font-normal text-ink-muted">· Add-on</span>}</p><p className="text-sm text-ink-muted"><span className="whitespace-nowrap">{order.ref}</span> · {shortDate(order.createdAt)}{order.slot?.date ? ` · ${shortDate(order.slot.date)} ${order.slot.window}` : ''}</p></div>
                      <div className="w-full sm:w-48"><div className="flex items-baseline justify-between gap-2"><Badge tone={STATUS_TONE[order.status]}>{t(`os.${order.status}`)}</Badge>{order.status !== 'cancelled' && <span className="num text-xs text-ink-muted">{ORDER_FLOW.indexOf(order.status) + 1}/{ORDER_FLOW.length}</span>}</div>{order.status !== 'cancelled' && <Meter value={orderShare(order.status)} tone={orderTone(order.status)} className="mt-1.5" label={t(`os.${order.status}`)} />}</div>
                      <span className="num text-sm sm:w-36 sm:text-right">{rupees(order.monthly)}{t('common.perMonth')}</span>
                    </Link></li>
                  ))}
                </ul>
              ) : <div className="card"><Empty title={t('dash.noOrders')} action={<Button to="/advisor" size="sm" variant="secondary" className="mt-2">{t('dash.new')}</Button>} /></div>}
            </section>
          </div>
        );
      }}
    </LoadState>
  );
}
