import { api } from '../../api/client.js';
import { rupees, shortDate, titleCase } from '../../lib/format.js';
import { Avatar, Badge, Card, Empty, LoadState, PageHeader, Stat, STATUS_TONE, useLoad } from '../../components/ui.jsx';

export default function PartnerActivations() {
  const state = useLoad(async () => (await api.get('/partner/activations')).data);
  return (
    <div className="">
      <PageHeader eyebrow="Partner app" title="Customers you helped" subtitle="Orders you touched through a case. Commission is illustrative: 8% of first-year recurring revenue, paid after activation, so the digital journey never competes with you." />
      <LoadState state={state}>
        {data => (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-3"><Stat label="Activated" value={data.totals.active} tone="green" /><Stat label="In progress" value={data.totals.inProgress} /><Stat label="Commission earned" value={rupees(data.totals.commission)} /></div>
            {data.orders.length ? <Card className="scroll-x"><table className="table"><thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Monthly</th><th>Commission</th></tr></thead><tbody>{data.orders.map(order => <tr key={order.id}><td className="font-semibold">{order.ref}</td><td><div className="flex items-center gap-2.5"><Avatar name={order.business || ''} size="sm" /><div>{order.business}<p className="text-xs text-ink-muted">{order.city}</p></div></div></td><td><Badge tone={STATUS_TONE[order.status]}>{titleCase(order.status)}</Badge>{order.activatedAt && <p className="text-xs text-ink-muted">{shortDate(order.activatedAt)}</p>}</td><td>{rupees(order.monthly)}</td><td className="num font-semibold text-ok-700">{order.commission ? rupees(order.commission) : '—'}</td></tr>)}</tbody></table></Card> : <Card><Empty title="No assisted orders yet">Resolve a case linked to an order and it appears here.</Empty></Card>}
          </>
        )}
      </LoadState>
    </div>
  );
}
