import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api, rememberQuoteToken, errorMessage } from '../../api/client.js';
import { useLanguage } from '../../i18n/index.jsx';
import { rupees, shortDate } from '../../lib/format.js';
import { Button, Card, Empty, LoadState, PageHeader, useLoad, useToast } from '../../components/ui.jsx';

export default function Services() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const toast = useToast();
  const state = useLoad(async () => (await api.get('/me/services')).data);
  const addMore = async baseOrderId => {
    try { const { data } = await api.post('/quotes', { mode: 'addon', baseOrderId, language }); rememberQuoteToken(data.quote.id, data.accessToken); navigate(`/quote/${data.quote.id}`); } catch (error) { toast(errorMessage(error), 'error'); }
  };
  return (
    <LoadState state={state}>
      {data => (
        <div className="">
          <PageHeader title={t('srv.title')} subtitle={data.monthly ? `${t('srv.monthly')}: ${rupees(data.monthly)}${t('common.perMonth')} · ${t('common.inclGst')}` : undefined} actions={data.orders[0] && <Button variant="secondary" onClick={() => addMore(data.orders[0].id)}><Plus className="h-4 w-4" />{t('srv.addMore')}</Button>} />
          {data.services.length ? (
            <ul className="card divide-y divide-line">
              {data.services.map(item => (
                <li key={`${item.orderRef}-${item.productId}`} className="grid gap-x-6 gap-y-1 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-baseline">
                  <div><p className="font-medium">{item.name}{item.quantity > 1 && ` × ${item.quantity}`}</p><p className="text-sm text-ink-muted">{item.why}</p></div>
                  <div className="text-sm sm:text-right"><p className="num font-medium">{rupees(item.monthly)}{t('common.perMonth')}</p><p className="text-ink-muted">{item.orderRef} · {shortDate(item.activatedAt)}</p></div>
                </li>
              ))}
            </ul>
          ) : <Card><Empty title={t('srv.empty')} action={<Button to="/advisor" size="sm" className="mt-2">{t('dash.new')}</Button>} /></Card>}
        </div>
      )}
    </LoadState>
  );
}
