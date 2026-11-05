import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Receipt } from 'lucide-react';
import { api, errorMessage } from '../../api/client.js';
import { useLanguage } from '../../i18n/index.jsx';
import { rupees, shortDate, longDate } from '../../lib/format.js';

const monthName = period => new Date(`${period}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
import { Badge, Button, Callout, Card, Empty, LoadState, PageHeader, STATUS_TONE, useLoad, useToast } from '../../components/ui.jsx';

export default function Bills() {
  const { t } = useLanguage();
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const state = useLoad(async () => (await api.get('/me/bills')).data);
  const pay = async (id, autopay) => {
    setBusy(id);
    try { await api.post(`/me/bills/${id}/pay`, { autopay }); toast(t('bills.paid')); await state.reload(true); } catch (error) { toast(errorMessage(error), 'error'); } finally { setBusy(''); }
  };
  return (
    <LoadState state={state}>
      {data => (
        <div className="space-y-6">
          <PageHeader title={t('bills.title')} subtitle={t('bills.oneBill')} />
          {data.nextBill && <Callout tone="info" className="flex flex-wrap items-end justify-between gap-3"><p className="num text-3xl font-semibold">{rupees(data.nextBill.amount)}</p><p className="max-w-sm text-sm text-ink-soft">{t('bills.nextBill', { date: longDate(data.nextBill.date), amount: rupees(data.nextBill.amount) })}</p></Callout>}
          {data.invoices.length ? data.invoices.map(invoice => (
            <Card key={invoice.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-sm text-ink-muted">{invoice.number} · {monthName(invoice.period)}</p><p className="num mt-1 text-3xl font-semibold">{rupees(invoice.total)}</p><p className="text-sm text-ink-muted">{invoice.status === 'paid' ? `${t('bills.paid')} ${shortDate(invoice.paidAt)}` : t('bills.due', { date: shortDate(invoice.dueDate) })}{invoice.autopay && ` · ${t('bills.autopay')}`}</p></div>
                <div className="flex items-center gap-2"><Badge tone={STATUS_TONE[invoice.status]}>{invoice.status === 'paid' ? t('bills.paid') : t('bills.pay')}</Badge>{invoice.status === 'due' && <Button size="sm" loading={busy === invoice.id} onClick={() => pay(invoice.id, true)}>{t('bills.pay')}</Button>}</div>
              </div>
              <table className="mt-4 w-full text-sm"><tbody>{invoice.lines.map(line => <tr key={`${line.orderRef}-${line.productId}`} className="border-t border-line"><td className="py-2">{line.name}{line.quantity > 1 && ` × ${line.quantity}`} <span className="text-xs text-ink-faint">{line.orderRef}</span></td><td className="py-2 text-right">{rupees(line.amount)}</td></tr>)}<tr className="border-t border-line"><td className="py-2 text-ink-muted">{t('quote.gst')}</td><td className="py-2 text-right">{rupees(invoice.tax)}</td></tr></tbody></table>
            </Card>
          )) : !data.nextBill && <Card><Empty title={t('bills.noBill')}>{t('bills.noBillBody')}</Empty></Card>}
          {data.receipts.length > 0 && <Card className="p-5"><h2 className="mb-2 text-base font-semibold">{t('bills.receipts')}</h2><ul className="divide-y divide-line text-sm">{data.receipts.map(receipt => (
                <li key={receipt.ref} className="py-3">
                  <div className="flex justify-between gap-3"><Link to={`/app/orders/${receipt.orderId}`} className="font-semibold hover:underline">{t('bills.orderPayment', { ref: receipt.ref })}</Link><span className="num font-semibold">{rupees(receipt.amount)}</span></div>
                  <p className="text-xs text-ink-muted">{shortDate(receipt.paidAt)} · UPI ref {receipt.reference}</p>
                  <div className="mt-1.5 flex justify-between text-ink-muted"><span>{t('bills.firstMonth')}</span><span>{rupees(receipt.firstMonth)}</span></div>
                  {receipt.setup > 0 && <div className="flex justify-between text-ink-muted"><span>{t('bills.oneTimeSetup')}</span><span>{rupees(receipt.setup)}</span></div>}
                  <p className="mt-1 text-xs text-ink-muted">{receipt.monthlyFrom ? t('bills.monthlyFrom', { date: longDate(receipt.monthlyFrom) }) : t('bills.monthlyAfterLive')}</p>
                </li>
              ))}</ul></Card>}
        </div>
      )}
    </LoadState>
  );
}
