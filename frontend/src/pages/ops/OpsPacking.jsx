import { useState } from 'react';
import { PackageCheck, Package } from 'lucide-react';
import { api, errorMessage } from '../../api/client.js';
import { longDate } from '../../lib/format.js';
import { Avatar, Button, Card, Empty, LoadState, PageHeader, useLoad, useToast } from '../../components/ui.jsx';

// Warehouse step: pack the kit generated from each order, record serials, release to the delivery agent.
export default function OpsPacking() {
  const toast = useToast();
  const [serials, setSerials] = useState({});
  const [busy, setBusy] = useState('');
  const state = useLoad(async () => (await api.get('/ops/packing')).data.orders);
  const pack = async order => {
    setBusy(order.id);
    const body = Object.fromEntries(order.kit.map(line => [line.item, String(serials[`${order.id}:${line.item}`] || '').split(',').map(value => value.trim()).filter(Boolean)]));
    try { await api.post(`/ops/orders/${order.id}/pack`, { serials: body }); toast(`${order.ref} packed; delivery agent notified`); await state.reload(true); } catch (error) { toast(errorMessage(error), 'error'); } finally { setBusy(''); }
  };
  return (
    <div className="">
      <PageHeader eyebrow="Warehouse" title="Kits to pack" subtitle="Kits are generated from each order's products. Serials are optional; they are auto-numbered if left blank." />
      <LoadState state={state}>
        {orders => orders.length ? <div className="grid gap-4 lg:grid-cols-2">{orders.map(order => (
          <Card key={order.id} className="p-5">
            <div className="flex flex-wrap items-start gap-3"><Avatar name={order.business || ''} /><div className="min-w-[10rem] flex-1"><p className="font-semibold">{order.business}</p><p className="text-sm text-ink-muted">{order.ref} · {order.city}</p></div><p className="w-full rounded-md bg-paper px-2.5 py-1 text-xs sm:w-auto sm:text-right"><span className="block text-ink-muted">Install</span><span className="font-medium">{longDate(order.slot?.date)} · {order.slot?.window}</span></p></div>
            <div className="mt-4 space-y-2 border-t border-line pt-4">{order.kit.map(line => <label key={line.item} className="grid gap-1 text-sm sm:grid-cols-[1fr_1.2fr] sm:items-center"><span className="font-medium">{line.item} <span className="num text-ink-muted">× {line.quantity}</span></span><input className="input py-1.5 text-sm" placeholder="Serials, comma-separated" value={serials[`${order.id}:${line.item}`] || ''} onChange={event => setSerials({ ...serials, [`${order.id}:${line.item}`]: event.target.value })} /></label>)}</div>
            <Button className="mt-4 w-full" loading={busy === order.id} onClick={() => pack(order)}><PackageCheck className="h-4 w-4" />Packed: release to delivery</Button>
          </Card>
        ))}</div> : <Card><Empty icon={Package} title="Nothing to pack">Orders appear here once the owner pays and books a slot.</Empty></Card>}
      </LoadState>
    </div>
  );
}
