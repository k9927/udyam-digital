import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { api, errorMessage } from '../../api/client.js';
import { rupees, titleCase } from '../../lib/format.js';
import { Badge, Button, LoadState, Meter, PageHeader, STATUS_TONE, useLoad, useToast, cx } from '../../components/ui.jsx';

// How much of the gap from baseline to target is closed already (0–1).
const towardTarget = kpi => {
  if (kpi.value === null || kpi.value === undefined) return null;
  const gap = kpi.better === 'lower' ? kpi.baseline - kpi.target : kpi.target - kpi.baseline;
  const moved = kpi.better === 'lower' ? kpi.baseline - kpi.value : kpi.value - kpi.baseline;
  return gap ? Math.max(0, Math.min(1, moved / gap)) : null;
};

const fmt = (kpi, value) => (value === null || value === undefined ? '—' : kpi.unit === '₹' ? rupees(value) : `${value.toLocaleString('en-IN')}${kpi.unit === '%' ? '%' : kpi.unit ? ` ${kpi.unit}` : ''}`);

// A list of label → count rows that link to the filtered view.
function CountList({ title, rows }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold">{title}</h2>
      {rows.length ? <ul className="divide-y divide-line border-y border-line text-sm">{rows.map(([key, label, count, to, tone]) => <li key={key}><Link to={to} className="flex items-center justify-between gap-3 py-2 hover:bg-paper/60">{tone ? <Badge tone={tone}>{label}</Badge> : <span>{label}</span>}<span className="num font-medium">{count}</span></Link></li>)}</ul> : <p className="text-sm text-ink-muted">None</p>}
    </section>
  );
}

export default function OpsDashboard() {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const state = useLoad(async () => (await api.get('/ops/dashboard')).data);
  const run = async (key, request, message) => {
    setBusy(key);
    try { await request(); toast(message); await state.reload(true); } catch (error) { toast(errorMessage(error), 'error'); } finally { setBusy(''); }
  };
  return (
    <div>
      <PageHeader title="Live journey dashboard" subtitle="How the digital journey is doing on live orders, against last quarter's baseline and the rollout targets." actions={<><Button variant="secondary" size="sm" loading={busy === 'sched'} onClick={() => run('sched', () => api.post('/ops/scheduler/run'), 'Checks run: stalled quotes and late orders routed')}><RefreshCw className="h-4 w-4" />Run SLA checks</Button><Button variant="ghost" size="sm" loading={busy === 'reset'} onClick={() => window.confirm('Reset all demo customers, orders and cases?') && run('reset', () => api.post('/ops/demo/reset'), 'Demo data reset')}><RotateCcw className="h-4 w-4" />Reset demo</Button></>} />
      <LoadState state={state}>
        {data => {
          const top = Math.max(1, ...data.funnel.map(row => row.count));
          const work = [['KYC in review', data.work.kycInReview, '/review', 'border-t-sky-600'], ['Open partner cases', data.work.openCases, '/ops/cases', 'border-t-warn-600'], ['Kits to pack', data.work.packing, '/ops/packing', 'border-t-ink'], ['Orders past due date', data.work.late, '/ops/orders?late=true', data.work.late ? 'border-t-brand-600' : 'border-t-ok-600']];
          return (
            <div className="space-y-10">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {work.map(([label, value, to, accent]) => (
                  <Link key={label} to={to} className={cx('card border-t-[3px] p-4 transition hover:-translate-y-px hover:shadow-pop', accent)}>
                    <p className={cx('num text-2xl font-semibold', label.startsWith('Orders past') && value > 0 && 'text-brand-700')}>{value}</p>
                    <p className="text-sm text-ink-muted">{label}</p>
                  </Link>
                ))}
              </div>

              <section>
                <h2 className="mb-3 text-base font-semibold">Success metrics</h2>
                <div className="card scroll-x">
                  <table className="table">
                    <thead><tr><th>Metric</th><th className="text-right">Now</th><th className="text-right">Baseline</th><th className="text-right">Target</th><th className="w-40">Toward target</th><th>How it is measured</th></tr></thead>
                    <tbody>
                      {data.kpis.map(kpi => {
                        const live = kpi.value !== null && kpi.value !== undefined;
                        const better = live && (kpi.better === 'lower' ? kpi.value < kpi.baseline : kpi.value > kpi.baseline);
                        return (
                          <tr key={kpi.key}>
                            <td className="font-medium">{kpi.label}</td>
                            <td className={cx('num whitespace-nowrap text-right font-semibold', live && (better ? 'text-ok-700' : 'text-brand-700'))}>{fmt(kpi, kpi.value)}</td>
                            <td className="num whitespace-nowrap text-right text-ink-muted">{fmt(kpi, kpi.baseline)}</td>
                            <td className="num whitespace-nowrap text-right">{kpi.better === 'lower' ? '≤ ' : '≥ '}{fmt(kpi, kpi.target)}</td>
                            <td>{towardTarget(kpi) === null ? <span className="text-xs text-ink-faint">Not live yet</span> : <div className="flex items-center gap-2"><Meter value={towardTarget(kpi)} tone={towardTarget(kpi) >= 1 ? 'ok' : towardTarget(kpi) > 0 ? 'amber' : 'red'} className="flex-1" label={`${kpi.label} toward target`} /><span className="num w-9 text-right text-xs text-ink-muted">{Math.round(towardTarget(kpi) * 100)}%</span></div>}</td>
                            <td className="text-ink-muted">{kpi.note}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
                <section>
                  <h2 className="text-base font-semibold">Live funnel</h2>
                  <p className="mb-3 text-sm text-ink-muted">From first quote to a working connection</p>
                  <ul className="card space-y-1 p-4">
                    {data.funnel.map((row, index) => {
                      const previous = data.funnel[index - 1]?.count;
                      const kept = previous ? Math.round((row.count / previous) * 100) : null;
                      return (
                        <li key={row.stage} className="grid grid-cols-[8rem_1fr_2.5rem_3rem] items-center gap-3 py-1.5 text-sm sm:grid-cols-[10rem_1fr_2.5rem_3.5rem]">
                          <span className="truncate text-ink-soft">{row.stage}</span>
                          <span className="h-6 rounded-[3px] bg-paper"><span className="block h-full rounded-[3px] bg-brand-600" style={{ width: `${Math.max(1.5, (row.count / top) * 100)}%`, opacity: 1 - index * 0.11 }} /></span>
                          <span className="num text-right font-semibold">{row.count}</span>
                          <span className={cx('num text-right text-xs', kept === null ? 'text-ink-faint' : kept >= 80 ? 'text-ok-700' : kept >= 60 ? 'text-warn-700' : 'text-brand-700')}>{kept === null ? 'start' : `${kept}%`}</span>
                        </li>
                      );
                    })}
                    <li className="border-t border-line pt-2.5 text-xs text-ink-muted">Right-hand figure: share of the previous stage that made it to this one.</li>
                  </ul>
                </section>
                <div className="space-y-8">
                  <CountList title="Orders by status" rows={Object.entries(data.byStatus).map(([status, count]) => [status, titleCase(status), count, `/ops/orders?status=${status}`, STATUS_TONE[status]])} />
                  <CountList title="Open cases by reason" rows={Object.entries(data.work.cases).filter(([kind]) => kind !== 'lead').map(([kind, count]) => [kind, titleCase(kind), count, `/ops/cases?kind=${kind}`])} />
                  {data.work.jobsToday.length > 0 && <CountList title="Field jobs today" rows={data.work.jobsToday.map(row => [`${row.type}-${row.status}`, `${titleCase(row.type)} · ${titleCase(row.status)}`, row.n, '/ops/orders'])} />}
                </div>
              </div>

              {data.late.length > 0 && <CountList title="Running late" rows={data.late.map(order => [order.id, order.ref, titleCase(order.status), `/ops/orders/${order.id}`])} />}
            </div>
          );
        }}
      </LoadState>
    </div>
  );
}
