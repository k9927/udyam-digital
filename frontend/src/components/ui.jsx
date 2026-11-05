import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, X, Check, CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import { errorMessage } from '../api/client.js';

const cx = (...classes) => classes.filter(Boolean).join(' ');

const VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300',
  secondary: 'border border-[#cfcfca] bg-white text-ink hover:border-ink disabled:text-ink-faint',
  dark: 'bg-ink text-white hover:bg-ink-soft disabled:bg-ink-faint',
  ghost: 'text-ink-soft hover:bg-ink/5 hover:text-ink',
  danger: 'border border-brand-200 bg-white text-brand-700 hover:bg-brand-50',
  success: 'bg-ok-600 text-white hover:bg-ok-700',
};
const SIZES = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5 text-[15px]', lg: 'px-5 py-3 text-base' };

export function Button({ variant = 'primary', size = 'md', loading = false, className = '', to, children, ...props }) {
  const classes = cx('inline-flex items-center justify-center gap-2 rounded-md font-medium transition disabled:cursor-not-allowed', VARIANTS[variant], SIZES[size], className);
  if (to) return <Link to={to} className={classes} {...props}>{children}</Link>;
  return <button type="button" className={classes} disabled={loading || props.disabled} {...props}>{loading && <Loader2 className="h-4 w-4 animate-spin" />}{children}</button>;
}

export const Card = ({ className = '', children, ...props }) => <div className={cx('card', className)} {...props}>{children}</div>;

// Status text with a coloured dot: reads as state, not decoration.
const TONES = {
  neutral: ['text-ink-muted', 'bg-ink-faint'], red: ['text-brand-700', 'bg-brand-600'], green: ['text-ok-700', 'bg-ok-600'],
  amber: ['text-warn-700', 'bg-warn-600'], blue: ['text-sky-800', 'bg-sky-600'], dark: ['text-ink', 'bg-ink'],
};
export const Badge = ({ tone = 'neutral', className = '', children }) => {
  const [text, dot] = TONES[tone] || TONES.neutral;
  return <span className={cx('inline-flex max-w-full items-center gap-1.5 whitespace-nowrap text-[13px] font-medium', text, className)}><span className={cx('h-1.5 w-1.5 flex-none rounded-full', dot)} /><span className="min-w-0 truncate">{children}</span></span>;
};

export const STATUS_TONE = {
  verified: 'green', in_review: 'blue', action_needed: 'red', documents_needed: 'amber', registry_needed: 'amber', not_started: 'neutral', rejected: 'red',
  active: 'green', cancelled: 'neutral', awaiting_kyc: 'amber', awaiting_signature: 'amber', awaiting_payment: 'amber', awaiting_slot: 'amber',
  packing: 'blue', ready_for_dispatch: 'blue', out_for_delivery: 'blue', delivered: 'blue', installing: 'blue', installed: 'green',
  open: 'amber', in_progress: 'blue', resolved: 'green', scheduled: 'blue', waiting: 'neutral', done: 'green', failed: 'red', due: 'amber', paid: 'green',
};

export const Spinner = ({ label }) => <div className="flex items-center justify-center gap-2 py-16 text-ink-muted"><Loader2 className="h-5 w-5 animate-spin" />{label}</div>;

export function Empty({ title, children, action }) {
  return <div className="flex flex-col items-center gap-2 px-6 py-12 text-center"><p className="font-medium">{title}</p>{children && <p className="max-w-md text-sm text-ink-muted">{children}</p>}{action}</div>;
}

// Older callers still pass an eyebrow; it is no longer drawn, so each page has one clear title.
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="text-2xl font-semibold sm:text-[28px] sm:leading-tight">{title}</h1>{subtitle && <p className="mt-1.5 max-w-2xl text-ink-muted">{subtitle}</p>}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }) {
  return <div className="border-l-2 border-line py-1 pl-3"><p className="text-sm text-ink-muted">{label}</p><p className={cx('num mt-1 text-2xl font-semibold', tone === 'red' && Number(value) > 0 && 'text-brand-700', tone === 'green' && Number(String(value).replace(/[^\d.]/g, '')) > 0 && 'text-ok-700')}>{value}</p>{hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}</div>;
}

// Initials on a soft tint picked from the name, so the same business or person always looks the same.
const AVATAR_TINTS = [['#fde4e2', '#9b1c1c'], ['#e2ecfd', '#1e4a8f'], ['#dff2e6', '#1b5e3b'], ['#fbefd6', '#7a4b06'], ['#ece6fb', '#4b2f8f'], ['#dcf1f1', '#145656']];
export function Avatar({ name = '', size = 'md', className = '' }) {
  name = String(name || '');
  const words = name.replace(/[^\p{L}\p{N} ]/gu, '').split(' ').filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2)).toUpperCase();
  const hash = [...name].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);
  const [bg, fg] = AVATAR_TINTS[hash % AVATAR_TINTS.length];
  const box = { sm: 'h-7 w-7 text-[11px]', md: 'h-9 w-9 text-[13px]', lg: 'h-12 w-12 text-base' }[size];
  return <span aria-hidden="true" className={cx('grid flex-none place-items-center rounded-full font-semibold', box, className)} style={{ background: bg, color: fg }}>{initials}</span>;
}

// A thin bar for "how far along": order progress, SLA used, progress to target.
const METER = { ok: 'bg-ok-600', ink: 'bg-ink/80', red: 'bg-brand-600', amber: 'bg-warn-600', blue: 'bg-sky-600' };
export function Meter({ value, max = 1, tone = 'ink', className = '', label }) {
  const share = Math.max(0, Math.min(1, max ? value / max : 0));
  return <span role="meter" aria-valuenow={Math.round(share * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label} className={cx('block h-1.5 overflow-hidden rounded-full bg-ink/[0.07]', className)}><span className={cx('block h-full rounded-full', METER[tone])} style={{ width: `${Math.max(share > 0 ? 3 : 0, share * 100)}%` }} /></span>;
}

// Where an order is on its way to live, as a share of the steps.
export const ORDER_FLOW = ['awaiting_kyc', 'awaiting_signature', 'awaiting_payment', 'awaiting_slot', 'packing', 'ready_for_dispatch', 'out_for_delivery', 'delivered', 'installing', 'installed', 'active'];
export const orderShare = status => (status === 'cancelled' ? 0 : (ORDER_FLOW.indexOf(status) + 1) / ORDER_FLOW.length);
export const orderTone = status => (status === 'active' || status === 'installed' ? 'ok' : status?.startsWith('awaiting') ? 'amber' : status === 'cancelled' ? 'ink' : 'blue');

// The one block on a page that asks for something: a tint plus a coloured rule on the left.
const CALLOUT = { action: 'border-l-brand-600 bg-brand-50/70', ok: 'border-l-ok-600 bg-ok-50', info: 'border-l-sky-600 bg-sky-50/70', wait: 'border-l-warn-600 bg-warn-50' };
export const Callout = ({ tone = 'info', className = '', children }) => <div className={cx('rounded-lg border border-line border-l-[3px] p-5', CALLOUT[tone], className)}>{children}</div>;

// A titled block separated by whitespace or a rule, instead of yet another card.
export function Section({ title, aside, className = '', children }) {
  return <section className={cx('py-6 first:pt-0', className)}>{(title || aside) && <div className="mb-3 flex items-baseline justify-between gap-3">{title && <h2 className="text-lg font-semibold">{title}</h2>}{aside}</div>}{children}</section>;
}

// Vertical steps: finished steps collapse to one line, the current one opens.
export function Steps({ items }) {
  return (
    <ol>
      {items.map((item, index) => {
        const last = index === items.length - 1;
        const state = item.state || 'todo';
        return (
          <li key={item.key || index} className="relative flex gap-4 pb-6 last:pb-0">
            {!last && <span className={cx('absolute left-[11px] top-7 bottom-1 w-px', state === 'done' ? 'bg-ok-600/40' : 'bg-line')} />}
            <span className={cx('num relative grid h-6 w-6 flex-none place-items-center rounded-full text-xs font-semibold', state === 'done' && 'bg-ok-600 text-white', state === 'current' && 'bg-ink text-white', state === 'todo' && 'border border-[#cfcfca] bg-white text-ink-muted', state === 'blocked' && 'bg-brand-600 text-white')}>{state === 'done' ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : index + 1}</span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><p className={cx('font-medium', state === 'todo' && 'text-ink-muted')}>{item.title}</p>{item.aside}</div>
              {item.summary && <p className="mt-0.5 text-sm text-ink-muted">{item.summary}</p>}
              {item.children && <div className="mt-3">{item.children}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const ALERT = { info: ['bg-sky-50/70 text-sky-950 border-sky-200', Info], success: ['bg-ok-50 text-ok-700 border-ok-600/25', CheckCircle2], warning: ['bg-warn-50 text-warn-700 border-warn-600/25', AlertTriangle], error: ['bg-brand-50 text-brand-800 border-brand-200', XCircle] };
export function Alert({ tone = 'info', title, children, className = '' }) {
  const [classes, Icon] = ALERT[tone];
  return <div className={cx('flex gap-3 rounded-md border p-3.5 text-sm', classes, className)}><Icon className="mt-0.5 h-4 w-4 flex-none" /><div>{title && <p className="font-semibold">{title}</p>}{children && <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>}</div></div>;
}

export function Field({ label, hint, children }) {
  return <label className="block"><span className="label">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}</label>;
}

// Small toast system for success/error feedback.
const ToastContext = createContext(() => {});
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, tone = 'success') => {
    const id = Math.random();
    setToasts(current => [...current, { id, message, tone }]);
    setTimeout(() => setToasts(current => current.filter(toast => toast.id !== id)), 3600);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map(toast => <div key={toast.id} role="status" className={cx('rise pointer-events-auto max-w-md rounded-md px-4 py-3 text-sm font-medium text-white shadow-pop', toast.tone === 'error' ? 'bg-brand-700' : 'bg-ink')}>{toast.message}</div>)}
      </div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);

// Loads data from the API and exposes reload; errors surface as a message instead of a blank screen.
export function useLoad(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const loaderRef = useRef(loader);
  useLayoutEffect(() => { loaderRef.current = loader; });
  const reload = useCallback(async (quiet = false) => {
    if (!quiet) setState(current => ({ ...current, loading: true }));
    try { setState({ data: await loaderRef.current(), loading: false, error: null }); } catch (error) { setState({ data: null, loading: false, error: errorMessage(error) }); }
  }, []);
  useEffect(() => {
    let alive = true;
    loaderRef.current()
      .then(data => alive && setState({ data, loading: false, error: null }))
      .catch(error => alive && setState({ data: null, loading: false, error: errorMessage(error) }));
    return () => { alive = false; };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload, setData: data => setState(current => ({ ...current, data })) };
}

export function LoadState({ state, children }) {
  if (state.loading && !state.data) return <Spinner />;
  if (state.error) return <Alert tone="error" title="Could not load">{state.error} <button className="font-semibold underline" onClick={() => state.reload()}>Retry</button></Alert>;
  return children(state.data);
}

export function Modal({ open, title, onClose, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-white p-5 shadow-pop sm:rounded-lg" onClick={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="mb-4 flex items-start justify-between gap-4"><h2 className="text-lg font-semibold">{title}</h2><button className="rounded-md p-1 text-ink-muted hover:bg-paper" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button></div>
        {children}
        {footer && <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">{footer}</div>}
      </div>
    </div>
  );
}

export { cx };
