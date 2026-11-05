import { useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { rupees, dateTime, shortDate, titleCase } from '../../lib/format.js';
import Timeline from '../../components/Timeline.jsx';
import { Avatar, Badge, Card, LoadState, Meter, ORDER_FLOW, STATUS_TONE, orderShare, orderTone, useLoad } from '../../components/ui.jsx';

const TIER = { gst: 'GST', udyam: 'Udyam', owner: 'Owner-verified' };

export default function OpsOrderDetail() {
  const { id } = useParams();
  const state = useLoad(async () => (await api.get(`/ops/orders/${id}`)).data, [id]);
  return (
    <LoadState state={state}>
      {({ order, business }) => (
        <div>
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar name={business.name} size="lg" />
              <div>
                <p className="text-sm text-ink-muted">{business.name} · {business.city}</p>
                <h1 className="mt-0.5 text-2xl font-semibold sm:text-[28px]">{order.ref}</h1>
                <p className="mt-0.5 text-sm text-ink-muted">{order.bundleName} · <span className="num">{rupees(order.totals.monthly)}</span>/month incl. GST</p>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-6">
              <div><p className="text-xs text-ink-muted">KYC</p><Badge tone={STATUS_TONE[business.kycStatus]}>{titleCase(business.kycStatus || 'not_started')}{business.tier ? ` · ${TIER[business.tier]}` : ''}</Badge></div>
              <div className="w-48"><div className="flex items-baseline justify-between"><Badge tone={STATUS_TONE[order.status]} className="text-sm">{titleCase(order.status)}</Badge>{order.status !== 'cancelled' && <span className="num text-xs text-ink-muted">{ORDER_FLOW.indexOf(order.status) + 1}/{ORDER_FLOW.length}</span>}</div><Meter value={orderShare(order.status)} tone={orderTone(order.status)} className="mt-1.5" label={titleCase(order.status)} /></div>
            </div>
          </div>
          <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.3fr]">
            <Card className="p-5"><h2 className="mb-4 text-base font-semibold">Milestones</h2><Timeline milestones={order.milestones} /></Card>
            <div className="space-y-4">
              <Card className="p-5">
                <h2 className="mb-3 text-base font-semibold">Field jobs</h2>
                {order.jobs.length ? (
                  <ul className="divide-y divide-line text-sm">
                    {order.jobs.map(job => (
                      <li key={job.id} className="py-3 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span className="font-medium">{titleCase(job.type)}</span>
                          <span className="flex items-center gap-2 text-ink-soft">{job.assignee && <Avatar name={job.assignee} size="sm" />}{job.assignee || 'Unassigned'}</span>
                          <span className="num text-ink-muted">{job.slot?.date ? `${shortDate(job.slot.date)} ${job.slot.window}` : ''}</span>
                          <Badge tone={STATUS_TONE[job.status]} className="ml-auto">{titleCase(job.status)}</Badge>
                        </div>
                        {(job.checklist?.hasPhoto || job.checklist?.speedMbps) && (
                          <div className="mt-3 flex flex-wrap items-end gap-4">
                            {job.checklist?.hasPhoto && <a href={`/api/field/jobs/${job.id}/photo?v=${job.checklist.photoAt || ''}`} target="_blank" rel="noreferrer" className="overflow-hidden rounded-md border border-line bg-paper p-1"><img src={`/api/field/jobs/${job.id}/photo?v=${job.checklist.photoAt || ''}`} alt="Installation photo" className="max-h-36 w-auto rounded-[3px] object-contain" /></a>}
                            {job.checklist?.speedMbps ? <span className="text-xs text-ink-muted">Speed test <span className="num font-medium text-ink">{job.checklist.speedMbps} Mbps</span></span> : null}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-ink-muted">Created when the owner books a slot.</p>}
              </Card>
              <Card className="p-5">
                <h2 className="mb-3 text-base font-semibold">Items and kit</h2>
                <ul className="divide-y divide-line text-sm">{order.items.map(item => <li key={item.productId} className="flex justify-between gap-3 py-2"><span>{item.name}{item.quantity > 1 && <span className="text-ink-muted"> × {item.quantity}</span>}</span><span className="num">{rupees(item.monthly)}</span></li>)}</ul>
                {order.kit.length > 0 && <p className="mt-3 border-t border-line pt-3 text-xs text-ink-muted">Kit: {order.kit.map(line => `${line.item} × ${line.quantity}${line.serials?.length ? ` (${line.serials.join(', ')})` : ''}`).join('; ')}</p>}
              </Card>
              <Card className="p-5"><h2 className="mb-3 text-base font-semibold">Event log</h2><ul className="space-y-2.5 text-sm">{[...order.events].reverse().map((event, index) => <li key={index}><p>{event.note || titleCase(event.status)}</p><p className="text-xs text-ink-muted">{dateTime(event.at)} · {event.role}</p></li>)}</ul></Card>
            </div>
          </div>
        </div>
      )}
    </LoadState>
  );
}
