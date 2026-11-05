import { useState } from 'react';
import { api, errorMessage } from '../../api/client.js';
import { rupees } from '../../lib/format.js';
import { Badge, Button, Card, LoadState, PageHeader, useLoad, useToast } from '../../components/ui.jsx';

export default function OpsCatalogue() {
  const toast = useToast();
  const [edit, setEdit] = useState(null);
  const state = useLoad(async () => (await api.get('/ops/catalogue')).data.products);
  const save = async () => {
    try { await api.patch(`/ops/catalogue/${edit.product_id}`, { price_min_inr_per_month: Number(edit.min), price_max_inr_per_month: Number(edit.max), one_time_setup_inr: Number(edit.setup) }); toast('Price updated; new quotes use it immediately'); setEdit(null); await state.reload(true); } catch (error) { toast(errorMessage(error), 'error'); }
  };
  return (
    <div className="">
      <PageHeader eyebrow="Administration" title="Product catalogue" subtitle="The pricing engine is the only source of prices and eligibility. Changes are audited." />
      <LoadState state={state}>
        {products => (
          <Card className="scroll-x"><table className="table"><thead><tr><th>Product</th><th>Price / month</th><th>Setup</th><th>Eligibility</th><th>Install</th><th /></tr></thead>
            <tbody>{products.map(product => edit?.product_id === product.product_id ? (
              <tr key={product.product_id}><td className="font-semibold">{product.product_id} · {product.product_name}</td><td><div className="flex gap-1"><input className="input w-24 py-1 text-sm" value={edit.min} onChange={event => setEdit({ ...edit, min: event.target.value })} /><input className="input w-24 py-1 text-sm" value={edit.max} onChange={event => setEdit({ ...edit, max: event.target.value })} /></div></td><td><input className="input w-24 py-1 text-sm" value={edit.setup} onChange={event => setEdit({ ...edit, setup: event.target.value })} /></td><td colSpan={2} /><td className="whitespace-nowrap"><Button size="sm" onClick={save}>Save</Button> <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button></td></tr>
            ) : (
              <tr key={product.product_id}><td><p className="font-semibold">{product.product_id} · {product.product_name}</p><p className="text-xs text-ink-muted">{product.category} · {product.unit}</p></td><td>{rupees(product.price_min_inr_per_month)}–{rupees(product.price_max_inr_per_month)}</td><td>{rupees(product.one_time_setup_inr)}</td><td className="text-xs"><div className="flex flex-wrap gap-1">{product.requires_gstin === 'Y' && <Badge tone="amber">GSTIN</Badge>}<Badge>Tier {product.available_city_tiers.replace(';', ', ')}</Badge>{Number(product.min_employees) > 1 && <Badge>{product.min_employees}+ staff</Badge>}{Number(product.min_sites) > 1 && <Badge>{product.min_sites}+ sites</Badge>}{product.requires_one_of && <Badge>Needs {product.requires_one_of.split('|').length > 2 ? 'connectivity' : product.requires_one_of}</Badge>}</div></td><td>{product.typical_install_days} d</td><td><Button size="sm" variant="ghost" onClick={() => setEdit({ product_id: product.product_id, min: product.price_min_inr_per_month, max: product.price_max_inr_per_month, setup: product.one_time_setup_inr })}>Edit</Button></td></tr>
            ))}</tbody></table></Card>
        )}
      </LoadState>
    </div>
  );
}
