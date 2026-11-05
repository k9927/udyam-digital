import { Check } from 'lucide-react';
import { useLanguage } from '../i18n/index.jsx';
import { shortDate } from '../lib/format.js';
import { cx } from './ui.jsx';

// Dated milestones for an order: done, current, and the expected date of every step still to come.
export default function Timeline({ milestones, compact = false }) {
  const { t } = useLanguage();
  const shown = compact ? milestones.filter(step => !['ready_for_dispatch', 'installed'].includes(step.status)) : milestones;
  return (
    <ol className="relative space-y-0">
      {shown.map((step, index) => (
        <li key={step.status} className="relative flex gap-3 pb-5 last:pb-0">
          {index < shown.length - 1 && <span className={cx('absolute left-[11px] top-6 h-full w-px', step.state === 'done' ? 'bg-ok-600/50' : 'bg-line')} />}
          <span className={cx('relative z-10 grid h-6 w-6 flex-none place-items-center rounded-full border', step.state === 'done' ? 'border-ok-600 bg-ok-600 text-white' : step.state === 'current' ? 'border-ink bg-white' : 'border-[#cfcfca] bg-white')}>{step.state === 'done' ? <Check className="h-3.5 w-3.5" /> : step.state === 'current' ? <span className="h-2 w-2 rounded-full bg-ink" /> : null}</span>
          <div className="flex flex-1 items-start justify-between gap-3">
            <p className={cx('text-sm', step.state === 'current' ? 'font-semibold text-ink' : step.state === 'done' ? 'text-ink-soft' : 'text-ink-muted')}>{t(`os.${step.status}`)}</p>
            {step.at && <p className={cx('whitespace-nowrap num text-xs', step.state === 'upcoming' ? 'text-ink-faint' : 'text-ink-muted')}>{step.state === 'upcoming' ? '~ ' : ''}{shortDate(step.at)}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
