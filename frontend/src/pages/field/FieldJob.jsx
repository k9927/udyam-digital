import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { MapPin, Phone, Clock, PlayCircle, KeyRound, AlertOctagon, Camera, Gauge, Wrench } from 'lucide-react';
import { api, errorMessage } from '../../api/client.js';
import { longDate, dateTime } from '../../lib/format.js';
import { Alert, Badge, Button, Card, Field, LoadState, Modal, STATUS_TONE, Steps, useLoad, useToast } from '../../components/ui.jsx';

// Turns [done, title, body, keep] rows into stepper items: done steps fold (unless `keep`), the first open one is current.
function toSteps(rows, open) {
  const current = open ? rows.findIndex(([done]) => !done) : -1;
  return rows.map(([done, title, body, keep], index) => ({ key: title, title, state: done ? 'done' : index === current ? 'current' : 'todo', children: (index === current || (done && keep)) ? body : null }));
}

export default function FieldJob() {
  const { id } = useParams();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [speed, setSpeed] = useState('');
  const [notes, setNotes] = useState('');
  const [failOpen, setFailOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');
  const state = useLoad(async () => (await api.get(`/field/jobs/${id}`)).data.job, [id]);
  const act = async (key, request, message) => {
    setBusy(key);
    try { const { data } = await request(); if (data.job) state.setData(data.job); else await state.reload(true); if (message) toast(message); return true; } catch (error) { toast(errorMessage(error), 'error'); return false; } finally { setBusy(''); }
  };
  const photo = file => { const form = new FormData(); form.append('file', file); return act('photo', () => api.post(`/field/jobs/${id}/photo`, form), 'Photo saved'); };

  return (
    <LoadState state={state}>
      {job => {
        const c = job.checklist || {};
        const open = ['scheduled', 'in_progress'].includes(job.status);
        const installing = job.type === 'installation' && job.status === 'in_progress';
        const photoView = c.hasPhoto && <a href={`/api/field/jobs/${id}/photo?v=${c.photoAt || ''}`} target="_blank" rel="noreferrer" className="mb-3 block w-fit overflow-hidden rounded-md border border-line bg-paper p-1"><img src={`/api/field/jobs/${id}/photo?v=${c.photoAt || ''}`} alt="Installation photo" className="max-h-48 w-auto rounded-[3px] object-contain" /></a>;
        const rows = job.type === 'delivery' ? [
          [job.status !== 'scheduled', 'Pick up the kit and start delivery', <Button loading={busy === 'start'} onClick={() => act('start', () => api.post(`/field/jobs/${id}/start`), 'Customer notified: out for delivery')}><PlayCircle className="h-4 w-4" />Start delivery</Button>],
          [job.status === 'done', "Hand over and confirm with the customer's code", <form className="flex max-w-sm gap-2" onSubmit={event => { event.preventDefault(); act('deliver', () => api.post(`/field/jobs/${id}/deliver`, { code }), 'Delivered'); }}><input className="input text-center font-mono tracking-[0.4em] placeholder:font-sans placeholder:tracking-normal" inputMode="numeric" maxLength={6} required placeholder="6-digit code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} /><Button type="submit" loading={busy === 'deliver'}><KeyRound className="h-4 w-4" />Confirm</Button></form>],
        ] : job.type === 'installation' ? [
          [job.status !== 'scheduled', 'Arrive on site', <Button loading={busy === 'start'} onClick={() => act('start', () => api.post(`/field/jobs/${id}/start`), 'Customer notified: installing')}><PlayCircle className="h-4 w-4" />I have arrived</Button>],
          [Boolean(c.installedAt), 'Install the equipment', <Button variant="secondary" loading={busy === 'installed'} onClick={() => act('installed', () => api.patch(`/field/jobs/${id}/checklist`, { installed: true }))}><Wrench className="h-4 w-4" />Equipment installed</Button>],
          [c.speedMbps !== undefined && c.speedMbps !== null, `Speed test${c.speedMbps ? `: ${c.speedMbps} Mbps` : ''}`, <form className="flex max-w-sm gap-2" onSubmit={event => { event.preventDefault(); act('speed', () => api.patch(`/field/jobs/${id}/checklist`, { speedMbps: Number(speed) })); }}><input className="input" inputMode="decimal" required placeholder="Measured Mbps" value={speed} onChange={event => setSpeed(event.target.value.replace(/[^\d.]/g, ''))} /><Button type="submit" variant="secondary" loading={busy === 'speed'}><Gauge className="h-4 w-4" />Save</Button></form>],
          [Boolean(c.hasPhoto), 'Photo of the installation', <>{photoView}{installing && <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[#cfcfca] bg-white px-4 py-2.5 text-sm font-medium hover:border-ink"><Camera className="h-4 w-4" />{busy === 'photo' ? 'Uploading…' : c.hasPhoto ? 'Retake photo' : 'Take or choose photo'}<input type="file" accept="image/*" capture="environment" className="sr-only" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) photo(file); }} /></label>}</>, true],
          [Boolean(c.signedOffAt), 'Customer sign-off', (
            <div className="space-y-3">
              <Button variant="secondary" loading={busy === 'signoff'} disabled={!c.installedAt || !c.hasPhoto || !c.speedMbps} onClick={() => act('signoff', () => api.post(`/field/jobs/${id}/signoff`), 'Code sent to the customer')}>Send sign-off code to customer</Button>
              <form className="flex max-w-sm gap-2" onSubmit={event => { event.preventDefault(); act('complete', () => api.post(`/field/jobs/${id}/complete`, { code }), 'Installed and activated'); }}><input className="input text-center font-mono tracking-[0.4em] placeholder:font-sans placeholder:tracking-normal" inputMode="numeric" maxLength={6} required placeholder="Customer's code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} /><Button type="submit" loading={busy === 'complete'}><KeyRound className="h-4 w-4" />Complete</Button></form>
            </div>
          )],
        ] : [
          [job.status !== 'scheduled', 'Start service visit', <Button loading={busy === 'start'} onClick={() => act('start', () => api.post(`/field/jobs/${id}/start`))}>Start</Button>],
          [job.status === 'done', 'Fix and note what you did', <form className="space-y-2" onSubmit={event => { event.preventDefault(); act('svc', () => api.post(`/field/jobs/${id}/service-complete`, { notes }), 'Ticket resolved'); }}><textarea className="input min-h-20" required minLength={3} value={notes} onChange={event => setNotes(event.target.value)} /><Button type="submit" loading={busy === 'svc'}>Complete visit</Button></form>],
        ];
        const doneCount = rows.filter(([done]) => done).length;
        return (
          <div className="max-w-4xl">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-sm capitalize text-ink-muted">{job.type} · {job.order?.ref}</p><h1 className="mt-1 text-2xl font-semibold sm:text-[28px]">{job.customer?.name}</h1></div>
              <Badge tone={STATUS_TONE[job.status]} className="text-sm capitalize">{job.status.replace('_', ' ')}</Badge>
            </div>
            <div className="grid gap-4 sm:grid-cols-[1.3fr_1fr]">
              <Card className="space-y-2.5 p-5 text-sm">
                <p className="flex gap-2.5"><Clock className="mt-0.5 h-4 w-4 flex-none text-ink-muted" /><span className="font-medium">{longDate(job.slot?.date)} · {job.slot?.window}</span></p>
                <p className="flex gap-2.5"><MapPin className="mt-0.5 h-4 w-4 flex-none text-ink-muted" />{job.customer?.address}</p>
                <p className="flex gap-2.5"><Phone className="mt-0.5 h-4 w-4 flex-none text-ink-muted" /><span>{job.customer?.contact} · <span className="num">{job.customer?.phone}</span><span className="block text-xs text-ink-muted">Masked; calls route through the app</span></span></p>
                {job.failReason && <Alert tone="warning">Last attempt: {job.failReason}</Alert>}
              </Card>
              <Card className="p-5"><p className="mb-2 font-medium">Kit</p><ul className="space-y-1 text-sm">{(job.order?.kit || []).map(line => <li key={line.item} className="flex justify-between"><span>{line.item} × {line.quantity}</span><span className="text-xs text-ink-faint">{line.serials?.slice(0, 2).join(', ')}</span></li>)}</ul><p className="mt-2 text-xs text-ink-muted">{job.order?.items.map(item => item.name).join(', ')}</p></Card>
            </div>

            <div className="card mt-6 p-5 sm:p-6">
              <div className="mb-5 flex items-center gap-4">
                <p className="text-sm font-medium">{doneCount} of {rows.length} done</p>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper"><span className="block h-full rounded-full bg-ok-600 transition-all" style={{ width: `${(doneCount / rows.length) * 100}%` }} /></span>
              </div>
              <Steps items={toSteps(rows, open)} />
            </div>
            {open && <button className="mt-5 flex items-center gap-2 text-sm font-medium text-brand-700 hover:underline" onClick={() => setFailOpen(true)}><AlertOctagon className="h-4 w-4" />Could not complete: report a problem</button>}
            {job.history?.length > 0 && <Card className="mt-6 p-5"><h2 className="mb-3 text-base font-semibold">History</h2><ul className="space-y-2 text-sm">{[...job.history].reverse().map((entry, index) => <li key={index}><p>{entry.note}</p><p className="text-xs text-ink-faint">{dateTime(entry.at)}</p></li>)}</ul></Card>}
            <Modal open={failOpen} title="Report a problem" onClose={() => setFailOpen(false)} footer={<Button variant="danger" loading={busy === 'fail'} onClick={async () => { if (await act('fail', () => api.post(`/field/jobs/${id}/fail`, { reason }), 'Rescheduled; customer informed')) setFailOpen(false); }}>Reschedule and inform customer</Button>}>
              <Field label="What happened?" hint="The job moves to the next working day; the customer gets an honest update."><select className="input mb-2" value={reason} onChange={event => setReason(event.target.value)}><option value="">Choose…</option><option>Customer not available</option><option>Shop closed</option><option>Wrong address</option><option>Site not ready</option><option>Equipment fault</option></select></Field>
            </Modal>
          </div>
        );
      }}
    </LoadState>
  );
}
