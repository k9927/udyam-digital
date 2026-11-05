import { Link } from 'react-router-dom';
import { Truck, Wrench, MapPin, ArrowRight, Clock } from 'lucide-react';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { longDate } from '../../lib/format.js';
import { Avatar, Badge, Card, Empty, LoadState, PageHeader, Stat, STATUS_TONE, useLoad, cx } from '../../components/ui.jsx';

const ICON = { delivery: Truck, installation: Wrench, service: Wrench };

export default function FieldJobs() {
  const { user } = useAuth();
  const state = useLoad(async () => (await api.get('/field/jobs')).data.jobs);
  const today = new Date().toLocaleDateString('en-CA');
  return (
    <div className="">
      <PageHeader eyebrow={user.role === 'delivery' ? 'Delivery app' : 'Technician app'} title="Today's jobs" subtitle="Every step you complete updates the customer's tracker instantly, so they never need to call." />
      <LoadState state={state}>
        {jobs => {
          const open = jobs.filter(job => ['scheduled', 'in_progress'].includes(job.status));
          const done = jobs.filter(job => job.status === 'done');
          return (
            <>
              <div className="mb-5 grid grid-cols-3 gap-3"><Stat label="Today" value={open.filter(job => job.slot?.date === today).length} tone="red" /><Stat label="Upcoming" value={open.filter(job => job.slot?.date > today).length} /><Stat label="Done (3 days)" value={done.length} tone="green" /></div>
              {open.length ? <div className="space-y-3">{open.map(job => { const Icon = ICON[job.type]; return (
                <Link key={job.id} to={`/field/jobs/${job.id}`}><Card className={cx('flex items-stretch gap-4 overflow-hidden transition hover:border-ink', job.status === 'in_progress' && 'border-l-[3px] border-l-sky-600')}>
                  <div className={cx('flex w-16 flex-none flex-col sm:w-20 items-center justify-center gap-1 border-r border-line px-2 py-4 text-center', job.slot?.date === today ? 'bg-brand-50/60' : 'bg-paper/60')}>
                    <Icon className="h-4 w-4 text-ink-muted" />
                    <p className="num text-lg font-semibold leading-none">{job.slot?.window?.split('–')[0] || '—'}</p>
                    <p className="text-[11px] text-ink-muted">{job.slot?.date === today ? 'Today' : longDate(job.slot?.date).split(',')[0]}</p>
                  </div>
                  <div className="min-w-0 flex-1 py-4">
                    <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{job.customer?.name}</p><Badge tone={STATUS_TONE[job.status]} className="capitalize">{job.status.replace('_', ' ')}</Badge>{job.attempts > 0 && <Badge tone="amber">Attempt {job.attempts + 1}</Badge>}</div>
                    <p className="flex items-center gap-1 text-sm text-ink-muted"><MapPin className="h-3.5 w-3.5" />{job.customer?.address}</p>
                    <p className="flex items-center gap-1 text-sm"><Clock className="h-3.5 w-3.5 text-ink-muted" /><span className="whitespace-nowrap">{job.slot?.window}</span> · <span className="capitalize">{job.type}</span></p>
                    <p className="text-xs text-ink-muted">{job.order?.ref}</p>
                  </div>
                  <ArrowRight className="mr-4 h-5 w-5 self-center text-ink-faint" />
                </Card></Link>
              ); })}</div> : <Card><Empty icon={Truck} title="No open jobs">New jobs are assigned automatically by city.</Empty></Card>}
              {done.length > 0 && <><h2 className="mb-2 mt-8 text-lg font-semibold">Recently completed</h2><Card className="divide-y divide-line">{done.map(job => <Link key={job.id} to={`/field/jobs/${job.id}`} className="flex items-center gap-3 p-3 text-sm hover:bg-paper/60"><Avatar name={job.customer?.name || ''} size="sm" /><span className="min-w-0 flex-1"><span className="block truncate">{job.customer?.name}</span><span className="block text-xs text-ink-muted">{job.order?.ref}</span></span><Badge tone="green"><span className="capitalize">{job.type}</span></Badge></Link>)}</Card></>}
            </>
          );
        }}
      </LoadState>
    </div>
  );
}
