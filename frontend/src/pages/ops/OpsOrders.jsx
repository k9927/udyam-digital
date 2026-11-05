import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { rupees, dateTime, shortDate, titleCase } from '../../lib/format.js';
import { Avatar, Badge, Button, Card, Empty, LoadState, Meter, PageHeader, STATUS_TONE, orderShare, orderTone, useLoad } from '../../components/ui.jsx';

const STATUSES = ['awaiting_kyc', 'awaiting_signature', 'awaiting_payment', 'awaiting_slot', 'packing', 'ready_for_dispatch', 'out_for_delivery', 'delivered', 'installing', 'active', 'cancelled'];

export default function OpsOrders() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const query = { status: params.get('status') || undefined, late: params.get('late') || undefined, q: params.get('q') || undefined };
  const state = useLoad(async () => (await api.get('/ops/orders', { params: query })).data.orders, [params.toString()]);
  const set = (key, value) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next); };
  return (
    <div className="">
      <PageHeader eyebrow="Operations" title="Orders" />
      <div className="mb-4 flex flex-wrap gap-2">
        <form onSubmit={event => { event.preventDefault(); set('q', q); }} className="flex gap-2"><input className="input py-2 text-sm" placeholder="Order reference" value={q} onChange={event => setQ(event.target.value)} /><Button type="submit" variant="secondary" size="sm">Find</Button></form>
        <select className="input w-auto py-2 text-sm" value={params.get('status') || ''} onChange={event => set('status', event.target.value)}><option value="">All statuses</option>{STATUSES.map(status => <option key={status} value={status}>{titleCase(status)}</option>)}</select>
        <label className="chip cursor-pointer"><input type="checkbox" className="mr-2 accent-ink" checked={params.get('late') === 'true'} onChange={event => set('late', event.target.checked ? 'true' : '')} />Past due date</label>
      </div>
      <LoadState state={state}>
        {orders => orders.length ? (
          <Card className="scroll-x"><table className="table"><thead><tr><th>Order</th><th>Business</th><th>Status</th><th>Install slot</th><th>Monthly</th><th>Updated</th></tr></thead>
            <tbody>{orders.map(order => <tr key={order.id}><td><Link className="font-medium text-ink underline decoration-line underline-offset-2 hover:decoration-ink" to={`/ops/orders/${order.id}`}>{order.ref}</Link></td><td><div className="flex items-center gap-2.5"><Avatar name={order.business || ''} size="sm" /><div>{order.business}<p className="text-xs text-ink-muted">{order.city}</p></div></div></td><td className="min-w-[11rem]"><Badge tone={STATUS_TONE[order.status]}>{titleCase(order.status)}</Badge>{order.late && <Badge tone="red" className="ml-2">Late</Badge>}<Meter value={orderShare(order.status)} tone={order.late ? 'red' : orderTone(order.status)} className="mt-1.5 max-w-[10rem]" label={titleCase(order.status)} />{order.statusCalls > 0 && <p className="mt-1 text-xs text-ink-muted">{order.statusCalls} status {order.statusCalls === 1 ? 'call' : 'calls'}</p>}</td><td>{order.slot?.date ? `${shortDate(order.slot.date)} ${order.slot.window}` : '—'}</td><td className="num">{rupees(order.monthly)}</td><td className="text-xs text-ink-muted">{dateTime(order.updatedAt)}</td></tr>)}</tbody></table></Card>
        ) : <Card><Empty title="No orders match these filters" action={<Button size="sm" variant="secondary" className="mt-2" onClick={() => setParams(new URLSearchParams())}>Clear filters</Button>} /></Card>}
      </LoadState>
    </div>
  );
}
