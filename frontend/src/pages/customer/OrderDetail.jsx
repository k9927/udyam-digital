import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, errorMessage } from '../../api/client.js';
import { useLanguage } from '../../i18n/index.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { rupees, shortDate, longDate, dateTime } from '../../lib/format.js';
import { Truck, Wrench } from 'lucide-react';
import { Alert, Avatar, Badge, Button, Card, Field, Meter, Modal, ORDER_FLOW, Spinner, STATUS_TONE, orderShare, orderTone, useToast, cx } from '../../components/ui.jsx';
import Timeline from '../../components/Timeline.jsx';

function CodeBox({ title, body, code }) {
  return <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{title}</p><p className="mt-0.5 text-sm text-ink-muted">{body}</p></div><p className="num rounded-md border border-dashed border-ink/30 px-4 py-2 font-mono text-3xl font-medium tracking-[0.25em]">{code}</p></Card>;
}

export default function OrderDetail() {
  const { id } = useParams();
  const { t } = useLanguage();
  const toast = useToast();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [signCode, setSignCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const { user } = useAuth();
  const [signer, setSigner] = useState(() => user?.name || '');
  const [autopay, setAutopay] = useState(true);
  const [slots, setSlots] = useState([]);
  const [slot, setSlot] = useState({ date: '', window: '' });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [keepCurrent, setKeepCurrent] = useState(false);
  const [allEvents, setAllEvents] = useState(false);

  const load = useCallback(async () => {
    try { setOrder((await api.get(`/orders/${id}`)).data.order); setError(''); } catch (err) { setError(errorMessage(err)); }
  }, [id]);
  useEffect(() => {
    api.get(`/orders/${id}`).then(({ data }) => setOrder(data.order)).catch(err => setError(errorMessage(err)));
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [id, load]);
  useEffect(() => { if (order?.status === 'awaiting_slot' && !slots.length) api.get(`/orders/${id}/slots`).then(({ data }) => setSlots(data.slots)).catch(() => {}); }, [order?.status, id, slots.length]);

  const act = async (key, task, success) => {
    setBusy(key);
    try { const result = await task(); if (result?.data?.order) setOrder(result.data.order); if (success) toast(success); } catch (err) { if (err.response?.data?.order) setOrder(err.response.data.order); toast(errorMessage(err), 'error'); } finally { setBusy(''); }
  };

  if (error && !order) return <Alert tone="error">{error}</Alert>;
  if (!order) return <Spinner />;
  const status = order.status;
  const installJob = order.jobs.find(job => job.type === 'installation');
  const deliveryJob = order.jobs.find(job => job.type === 'delivery');
  const canCancel = ['awaiting_kyc', 'awaiting_signature', 'awaiting_payment', 'awaiting_slot', 'packing'].includes(status);
  const active = status === 'active';
  const expected = order.milestones.find(step => step.status === 'active')?.at;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm text-ink-muted">{order.bundleName}</p><h1 className="mt-1 text-2xl font-semibold sm:text-[28px]">{t('order.title', { ref: order.ref })}</h1>{order.partner && <p className="mt-1 text-sm text-ink-muted">{t('order.partner', { name: order.partner })}</p>}</div>
        <div className="flex flex-wrap items-center gap-4"><div className="w-full min-w-0 sm:w-52"><div className="flex items-baseline justify-between gap-2"><Badge tone={STATUS_TONE[status]} className="min-w-0 truncate text-sm">{t(`os.${status}`)}</Badge>{status !== 'cancelled' && <span className="num text-xs text-ink-muted">{ORDER_FLOW.indexOf(status) + 1}/{ORDER_FLOW.length}</span>}</div>{status !== 'cancelled' && <Meter value={orderShare(status)} tone={orderTone(status)} className="mt-1.5" label={t(`os.${status}`)} />}</div>{!active && status !== 'cancelled' && <Button variant="secondary" size="sm" loading={busy === 'callback'} disabled={Boolean(order.callbackRequestedAt)} onClick={() => act('callback', () => api.post(`/orders/${id}/callback`), t('order.callbackDone'))}>{order.callbackRequestedAt ? t('order.callbackDone') : t('order.callback')}</Button>}</div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          {status === 'awaiting_kyc' && <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><p className="flex-1 font-medium">{t('order.waitingKyc')}</p><Button to="/app/kyc">{t('order.goKyc')}</Button></Card>}

          {status === 'awaiting_signature' && order.gstUpgrade && !keepCurrent && (
            <Card className="border-l-[3px] border-l-sky-600 bg-sky-50/50 p-5">
              <h2 className="text-lg font-semibold">{t('order.upgradeTitle')}</h2>
              <p className="mt-1 text-sm text-ink-muted">{t('order.upgradeBody')}</p>
              <ul className="mt-3 space-y-2 text-sm">{order.gstUpgrade.added.map(item => <li key={item.name}><span className="font-semibold">+ {item.name}</span><span className="block text-ink-muted">{item.why}</span></li>)}{order.gstUpgrade.removed.map(name => <li key={name} className="text-ink-muted">− {name}</li>)}</ul>
              <p className="mt-3 text-sm font-semibold">{order.gstUpgrade.bundleName} · {rupees(order.gstUpgrade.monthly)}{t('common.perMonth')} <span className="font-normal text-ink-muted">({order.gstUpgrade.monthlyDelta >= 0 ? '+' : '−'}{rupees(Math.abs(order.gstUpgrade.monthlyDelta))}{t('common.perMonth')})</span></p>
              <div className="mt-4 flex flex-wrap gap-2"><Button variant="dark" loading={busy === 'upgrade'} onClick={() => act('upgrade', () => api.post(`/orders/${id}/gst-upgrade`), t('order.upgradeDone'))}>{t('order.upgradeApply')}</Button><Button variant="ghost" onClick={() => setKeepCurrent(true)}>{t('order.upgradeKeep')}</Button></div>
            </Card>
          )}

          {status === 'awaiting_signature' && (
            <Card className="p-5">
              <h2 className="text-lg font-semibold">{t('order.signTitle')}</h2>
              <p className="mt-1 text-sm text-ink-muted">{t('order.signBody')}</p>
              <div className="mt-4 rounded-md bg-paper p-4 text-sm"><p className="font-medium">{order.bundleName}</p><p>{order.items.map(item => `${item.name}${item.quantity > 1 ? ` × ${item.quantity}` : ''}`).join(', ')}</p><p className="mt-1">{rupees(order.totals.monthly)}{t('common.perMonth')} · {t('quote.commitment')} {t('common.months', { n: order.totals.commitmentMonths })} · {t('quote.dueNow')} {rupees(order.totals.dueNow)}</p></div>
              {!devCode && !signCode ? <Button className="mt-4" loading={busy === 'code'} onClick={() => act('code', async () => { const { data } = await api.post(`/orders/${id}/sign/request`); setDevCode(data.devCode || 'sent'); })}>{t('order.sendCode')}</Button> : (
                <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={event => { event.preventDefault(); act('sign', () => api.post(`/orders/${id}/sign`, { code: signCode, signerName: signer })); }}>
                  {devCode && devCode !== 'sent' && <Alert tone="info" className="sm:col-span-3">{t('login.devCode', { code: devCode })}</Alert>}
                  <Field label={t('order.signer')}><input className="input" required minLength={2} value={signer} onChange={event => setSigner(event.target.value)} /></Field>
                  <Field label={t('login.code')}><input className="input tracking-widest" required inputMode="numeric" maxLength={6} value={signCode} onChange={event => setSignCode(event.target.value.replace(/\D/g, ''))} /></Field>
                  <Button type="submit" loading={busy === 'sign'}>{t('order.sign')}</Button>
                </form>
              )}
            </Card>
          )}

          {status === 'awaiting_payment' && (
            <Card className="p-5">
              <h2 className="text-lg font-semibold">{t('order.payTitle')}</h2>
              <p className="mt-1 text-sm text-ink-muted">{t('order.payBody')}</p>
              {order.paymentFailures > 0 && <Alert tone="warning" className="mt-3">{t('order.payFailed', { n: order.paymentFailures })}</Alert>}
              <label className="mt-4 flex items-center gap-3 text-sm"><input type="checkbox" className="h-4 w-4 accent-ink" checked={autopay} onChange={event => setAutopay(event.target.checked)} />{t('order.autopay')}</label>
              <div className="mt-4 flex flex-wrap gap-2"><Button size="lg" className="w-full sm:w-auto" loading={busy === 'pay'} onClick={() => act('pay', () => api.post(`/orders/${id}/pay`, { simulate: 'success', autopay }))}>{t('order.pay', { amount: rupees(order.totals.dueNow) })}</Button><Button variant="ghost" size="sm" loading={busy === 'fail'} onClick={() => act('fail', () => api.post(`/orders/${id}/pay`, { simulate: 'failure', autopay }))}>{t('order.payFail')}</Button></div>
            </Card>
          )}

          {status === 'awaiting_slot' && (
            <Card className="p-5">
              <h2 className="text-lg font-semibold">{t('order.slotTitle')}</h2>
              <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">{slots.map(option => <button key={option.date} onClick={() => setSlot({ date: option.date, window: '' })} className={cx('min-w-24 rounded-md border px-3 py-2 text-left', slot.date === option.date ? 'border-ink bg-ink text-white' : 'border-[#cfcfca] bg-white hover:border-ink')}><p className="text-xs opacity-70">{new Date(`${option.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short' })}</p><p className="font-medium">{shortDate(option.date)}</p></button>)}</div>
              {slot.date && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{slots.find(option => option.date === slot.date)?.windows.map(window => <button key={window} onClick={() => setSlot({ ...slot, window })} className={cx('rounded-md border px-3 py-2 text-sm font-medium', slot.window === window ? 'border-ink bg-ink text-white' : 'border-[#cfcfca] bg-white hover:border-ink')}>{window}</button>)}</div>}
              <Button className="mt-4" disabled={!slot.date || !slot.window} loading={busy === 'slot'} onClick={() => act('slot', () => api.post(`/orders/${id}/slot`, slot))}>{t('order.book')}</Button>
            </Card>
          )}

          {order.deliveryCode && <CodeBox title={t('order.deliveryCode')} body={t('order.deliveryCodeBody')} code={order.deliveryCode} />}
          {order.installCode && <CodeBox title={t('order.installCode')} body={t('order.installCodeBody')} code={order.installCode} />}

          {['packing', 'ready_for_dispatch', 'out_for_delivery', 'delivered', 'installing'].includes(status) && (
            <Card className="grid gap-4 p-5 sm:grid-cols-2">
              <div><div><p className="font-medium">{t('order.kit')}</p><p className="text-sm text-ink-muted">{order.kit.map(line => `${line.item} × ${line.quantity}`).join(', ') || '—'}</p>{deliveryJob?.assignee && <p className="mt-2 flex items-center gap-2 text-sm"><Truck className="h-4 w-4 text-ink-muted" /><Avatar name={deliveryJob.assignee} size="sm" />{deliveryJob.assignee}</p>}</div></div>
              <div><div><p className="font-medium">{order.slot && `${longDate(order.slot.date)}, ${order.slot.window}`}</p>{installJob?.assignee ? <p className="mt-2 flex items-center gap-2 text-sm"><Wrench className="h-4 w-4 text-ink-muted" /><Avatar name={installJob.assignee} size="sm" />{installJob.assignee}{installJob?.attempts ? <span className="text-ink-muted"> · {installJob.failReason}</span> : null}</p> : <p className="text-sm text-ink-muted">—</p>}</div></div>
              {installJob?.checklist?.hasPhoto && (
                <div className="sm:col-span-2">
                  <p className="mb-2 text-sm font-medium">{t('order.installPhoto')}{installJob.checklist.speedMbps ? ` · ${t('order.speedTest', { mbps: installJob.checklist.speedMbps })}` : ''}</p>
                  <a href={`/api/field/jobs/${installJob.id}/photo?v=${installJob.checklist.photoAt || ''}`} target="_blank" rel="noreferrer" className="block w-fit overflow-hidden rounded-md border border-line"><img src={`/api/field/jobs/${installJob.id}/photo?v=${installJob.checklist.photoAt || ''}`} alt={t('order.installPhoto')} className="max-h-64 w-auto object-contain" /></a>
                </div>
              )}
            </Card>
          )}

          {active && (
            <Card className="p-5">
              <p className="font-medium">{t('order.rate')}</p>
              {order.rating ? <p className="mt-2 text-ok-700">{t('order.rateThanks', { score: order.rating.score })}</p> : <div className="mt-3 grid grid-cols-6 gap-1.5 sm:flex sm:flex-wrap">{Array.from({ length: 11 }, (_, score) => <button key={score} onClick={() => act('rate', () => api.post(`/orders/${id}/rate`, { score }))} className="num h-11 rounded-md border sm:w-10 border-[#cfcfca] font-medium hover:border-ink hover:bg-ink hover:text-white">{score}</button>)}</div>}
              <a href="/app/services" className="mt-4 inline-block text-sm font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink">{t('srv.title')}</a>
            </Card>
          )}
          {/* After go-live the owner keeps the technician's proof of installation. */}
          {active && installJob?.checklist?.hasPhoto && (
            <Card className="p-5">
              <p className="mb-2 text-sm font-medium">{t('order.installPhoto')}{installJob.checklist.speedMbps ? ` · ${t('order.speedTest', { mbps: installJob.checklist.speedMbps })}` : ''}</p>
              <a href={`/api/field/jobs/${installJob.id}/photo?v=${installJob.checklist.photoAt || ''}`} target="_blank" rel="noreferrer" className="block w-fit overflow-hidden rounded-md border border-line bg-paper p-1"><img src={`/api/field/jobs/${installJob.id}/photo?v=${installJob.checklist.photoAt || ''}`} alt={t('order.installPhoto')} className="max-h-56 w-auto rounded-[3px] object-contain" /></a>
            </Card>
          )}
          {status === 'cancelled' && <Alert tone="info" title={t('os.cancelled')}>{order.cancelReason}</Alert>}

          <Card className="p-5">
            <h2 className="mb-2 text-base font-semibold">{t('order.items')}</h2>
            <ul className="divide-y divide-line">{order.items.map(item => <li key={item.productId} className="flex justify-between gap-3 py-2.5 text-sm"><span><span className="font-medium">{item.name}</span>{item.quantity > 1 && ` × ${item.quantity}`}<span className="block text-xs text-ink-muted">{item.why}</span></span><span className="num whitespace-nowrap">{rupees(item.monthly)}</span></li>)}</ul>
            {/* Two different amounts: the monthly bill, and the one payment at order (first month + one-time setup). */}
            <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-ink-muted">{t('quote.subtotal')}</dt><dd>{rupees(order.totals.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">{t('quote.gst')}</dt><dd>{rupees(order.totals.tax)}</dd></div>
              <div className="flex justify-between text-base font-semibold"><dt>{t('order.monthlyBill')}</dt><dd>{rupees(order.totals.monthly)}{t('common.perMonth')}</dd></div>
            </dl>
            <dl className="num mt-3 space-y-1.5 rounded-md bg-paper p-3 text-sm">
              <div className="flex justify-between"><dt className="text-ink-muted">{t('bills.firstMonth')}</dt><dd>{rupees(order.totals.monthly)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">{t('quote.setup')}</dt><dd>{rupees(order.totals.setup)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">{t('quote.setupGst')}</dt><dd>{rupees(order.totals.setupTax)}</dd></div>
              <div className="flex justify-between border-t border-line pt-1.5 font-semibold"><dt>{order.paidAt ? t('order.paidAtOrder') : t('quote.dueNow')}</dt><dd>{rupees(order.totals.dueNow)}</dd></div>
              <p className="pt-1 text-xs text-ink-muted">{t('order.billingNote')}</p>
            </dl>
            {order.signature && <p className="mt-2 text-xs text-ink-muted">{t('order.signed', { name: order.signature.signerName })} · {dateTime(order.signature.signedAt)}</p>}
            {canCancel && <button className="mt-4 text-sm text-ink-muted underline hover:text-brand-700" onClick={() => setCancelOpen(true)}>{t('order.cancel')}</button>}
          </Card>
        </div>

        <div className="space-y-4">
          {status !== 'cancelled' && <Card className="p-5">
            <div className="mb-4 flex items-baseline justify-between gap-3"><h2 className="text-base font-semibold">{t('order.progress')}</h2>{expected && status !== 'cancelled' && <p className="text-sm"><span className="text-ink-muted">{t('order.expected')}: </span><span className="font-medium">{shortDate(expected)}</span></p>}</div>
            <Timeline milestones={order.milestones} />
            <p className="mt-4 border-t border-line pt-3 text-xs text-ink-muted">{t('order.noCalls')}</p>
          </Card>}
          <Card className="p-5">
            <h2 className="mb-3 text-base font-semibold">Activity</h2>
            <ul className="space-y-2.5">{[...order.events].reverse().slice(0, allEvents ? 40 : 5).map((event, index) => <li key={index} className="text-sm"><p className="font-medium">{event.note || t(`os.${event.status}`)}</p><p className="text-xs text-ink-muted">{dateTime(event.at)}</p></li>)}</ul>
            {order.events.length > 5 && <button className="mt-3 text-sm text-ink-muted underline hover:text-ink" onClick={() => setAllEvents(!allEvents)}>{allEvents ? t('common.close') : `+ ${order.events.length - 5}`}</button>}
          </Card>
        </div>
      </div>

      <Modal open={cancelOpen} title={t('order.cancel')} onClose={() => setCancelOpen(false)} footer={<><Button variant="secondary" onClick={() => setCancelOpen(false)}>{t('common.back')}</Button><Button variant="danger" loading={busy === 'cancel'} onClick={() => act('cancel', () => api.post(`/orders/${id}/cancel`, { reason })).then(() => setCancelOpen(false))}>{t('order.cancel')}</Button></>}>
        <Field label={t('order.cancelReason')}><textarea className="input min-h-24" value={reason} onChange={event => setReason(event.target.value)} /></Field>
      </Modal>
    </div>
  );
}
