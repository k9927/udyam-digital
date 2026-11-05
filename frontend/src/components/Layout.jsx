import { Component, useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Menu, X, LogOut, Users, Store, Wrench, ShieldCheck, LayoutDashboard, Truck, Globe2, UserCog } from 'lucide-react';
import { useAuth, HOME_FOR_ROLE } from '../context/AuthContext.jsx';
import { useLanguage, LANGUAGES } from '../i18n/index.jsx';
import { api } from '../api/client.js';
import { Avatar, cx, Spinner } from './ui.jsx';

export function Logo({ to = '/' }) {
  return (
    <Link to={to} className="flex items-center gap-2.5" aria-label="Udyam Digital home">
      <span className="grid h-7 w-7 place-items-center rounded-[6px] bg-brand-600 text-[15px] font-semibold leading-none text-white">a</span>
      <span className="text-[17px] font-semibold tracking-tight">Accel Business</span>
    </Link>
  );
}

export function LanguagePicker({ className = '' }) {
  const { language, setLanguage } = useLanguage();
  const { user } = useAuth();
  const change = value => {
    setLanguage(value);
    if (user?.role === 'customer') api.patch('/auth/me', { preferredLanguage: value }).catch(() => {});
  };
  return (
    <label className={cx('relative inline-flex items-center', className)}>
      <Globe2 className="pointer-events-none absolute left-2.5 h-4 w-4 text-ink-muted" />
      <select aria-label="Language" value={language} onChange={event => change(event.target.value)} className="appearance-none rounded-md border border-transparent bg-transparent py-2 pl-8 pr-2 text-sm font-medium text-ink-soft hover:border-line focus:border-ink focus:outline-none">
        {LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
      </select>
    </label>
  );
}

export function NotificationBell({ to }) {
  const [unread, setUnread] = useState(0);
  const { pathname } = useLocation();
  useEffect(() => { api.get('/notifications').then(({ data }) => setUnread(data.unread)).catch(() => {}); }, [pathname]);
  return <Link to={to} className="relative rounded-md p-2 text-ink-soft hover:bg-ink/5 hover:text-ink" aria-label={`Messages${unread ? `, ${unread} unread` : ''}`}><Bell className="h-5 w-5" />{unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[11px] font-semibold text-white">{unread}</span>}</Link>;
}

function PublicHeader() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const home = user ? HOME_FOR_ROLE[user.role] : '/login';
  const links = [['/advisor', t('nav.find')], ['/track', t('nav.track')]];
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-4">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex">{links.map(([to, label]) => <NavLink key={to} to={to} className={({ isActive }) => cx('rounded-md px-3 py-2 text-sm font-medium', isActive ? 'text-ink' : 'text-ink-muted hover:text-ink')}>{label}</NavLink>)}</nav>
        <div className="ml-auto hidden items-center gap-1 md:flex">
          <LanguagePicker />
          {user?.role === 'customer' && <NotificationBell to="/app/messages" />}
          {user ? <><Link to={home} className="ml-1 rounded-md bg-ink px-3.5 py-2 text-sm font-medium text-white hover:bg-ink-soft">{user.role === 'customer' ? t('nav.myBusiness') : 'Console'}</Link><button className="rounded-md p-2 text-ink-muted hover:bg-ink/5 hover:text-ink" onClick={async () => { await logout(); navigate('/'); }} aria-label={t('nav.signOut')}><LogOut className="h-5 w-5" /></button></> : <Link to="/login" className="ml-1 rounded-md bg-ink px-3.5 py-2 text-sm font-medium text-white hover:bg-ink-soft">{t('nav.signIn')}</Link>}
        </div>
        <button className="ml-auto rounded-md p-2 md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">{open ? <X /> : <Menu />}</button>
      </div>
      {open && (
        <div className="border-t border-line bg-white px-4 py-3 md:hidden" onClick={() => setOpen(false)}>
          {links.map(([to, label]) => <Link key={to} to={to} className="block rounded-md px-2 py-2.5 font-medium">{label}</Link>)}
          <Link to={home} className="block rounded-md px-2 py-2.5 font-medium">{user ? (user.role === 'customer' ? t('nav.myBusiness') : 'Console') : t('nav.signIn')}</Link>
          {user && <button className="block w-full rounded-md px-2 py-2.5 text-left font-medium text-ink-muted" onClick={async () => { await logout(); navigate('/'); }}>{t('nav.signOut')}</button>}
          <div className="pt-2" onClick={event => event.stopPropagation()}><LanguagePicker /></div>
        </div>
      )}
    </header>
  );
}

export function Footer() {
  const { t } = useLanguage();
  return (
    <footer className="mt-16 border-t border-line bg-white">
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-6 text-sm text-ink-muted sm:grid-cols-2 sm:gap-6 sm:py-8 lg:grid-cols-4">
        <div><p className="font-medium text-ink">Accel Business · Udyam Digital</p><p className="mt-1.5">{t('footer.tagline')}</p></div>
        <div className="hidden space-y-2 sm:block"><Link to="/advisor" className="block hover:text-ink">{t('nav.find')}</Link><Link to="/track" className="block hover:text-ink">{t('nav.track')}</Link><Link to="/whatsapp" className="block hover:text-ink">{t('wa.cta')}</Link></div>
        <div className="space-y-2"><Link to="/privacy" className="block hover:text-ink">{t('footer.privacy')}</Link><p>{t('footer.grievance')}</p></div>
        <div className="hidden space-y-2 sm:block"><Link to="/staff/login" className="block hover:text-ink">{t('nav.partner')}</Link><Link to="/staff/login" className="block hover:text-ink">{t('nav.staff')}</Link><p className="text-xs">{t('footer.synthetic')}</p></div>
      </div>
    </footer>
  );
}

// Catches a crash in one page so the header, navigation and a way back stay on screen.
export class PageBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error('Page failed to render:', error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="mx-auto max-w-md py-16 text-center"><h1 className="text-xl font-semibold">This page could not be shown</h1><p className="mt-2 text-ink-muted">Something went wrong while loading it. Your data is safe.</p><div className="mt-5 flex justify-center gap-2"><button className="rounded-md border border-[#cfcfca] bg-white px-4 py-2 text-sm font-medium hover:border-ink" onClick={() => window.history.back()}>Go back</button><button className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white" onClick={() => window.location.reload()}>Reload</button></div></div>;
  }
}

function Boundary() {
  const { pathname } = useLocation();
  return <PageBoundary key={pathname}><Outlet /></PageBoundary>;
}

export function PublicLayout() {
  return <div className="flex min-h-screen flex-col"><PublicHeader /><main className="flex-1"><Boundary /></main><Footer /></div>;
}

export function CustomerLayout() {
  const { t } = useLanguage();
  const tabs = [['/app', t('nav.myBusiness'), true], ['/app/kyc', t('dash.verification')], ['/app/services', t('srv.title')], ['/app/bills', t('bills.title')], ['/app/help', t('helpPage.title')], ['/app/messages', t('notif.title')], ['/app/data', t('data.title')]];
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <div className="border-b border-line bg-white"><nav className="no-scrollbar fade-x mx-auto flex max-w-6xl gap-6 overflow-x-auto px-4">{tabs.map(([to, label, end]) => <NavLink key={to} to={to} end={end} className={({ isActive }) => cx('whitespace-nowrap border-b-2 py-3 text-sm font-medium', isActive ? 'border-ink text-ink' : 'border-transparent text-ink-muted hover:text-ink')}>{label}</NavLink>)}</nav></div>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8"><Boundary /></main>
      <Footer />
    </div>
  );
}

const STAFF_NAV = {
  partner: [['/partner', 'My queue', Users, true], ['/partner/leads', 'Ranked leads', Store], ['/partner/activations', 'My activations', ShieldCheck]],
  delivery: [['/field', 'My jobs', Truck, true]],
  technician: [['/field', 'My jobs', Wrench, true]],
  kyc_officer: [['/review', 'Review queue', ShieldCheck, true]],
  ops_admin: [['/ops', 'Dashboard', LayoutDashboard, true], ['/ops/orders', 'Orders', Truck], ['/ops/packing', 'Warehouse packing', Wrench], ['/ops/cases', 'Partner cases', Users], ['/ops/tickets', 'Support tickets', Bell], ['/review', 'KYC review', ShieldCheck], ['/ops/users', 'Team & roles', UserCog], ['/ops/catalogue', 'Catalogue', Store], ['/ops/audit', 'Audit & privacy', ShieldCheck]],
};
STAFF_NAV.super_admin = STAFF_NAV.ops_admin;
export const ROLE_LABEL = { customer: 'Business owner', partner: 'Channel partner', delivery: 'Delivery agent', technician: 'Technician', kyc_officer: 'KYC officer', ops_admin: 'Operations admin', super_admin: 'Super admin' };

export function StaffLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const nav = STAFF_NAV[user.role] || [];
  const sidebar = (
    <div className="flex h-full flex-col gap-6 px-3 py-4">
      <div className="px-2"><Logo to={HOME_FOR_ROLE[user.role]} /></div>
      <nav className="flex flex-col gap-0.5">{nav.map(([to, label, Icon, end]) => <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)} className={({ isActive }) => cx('relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium', isActive ? 'bg-brand-50/70 text-ink before:absolute before:inset-y-1.5 before:-left-3 before:w-[3px] before:rounded-r before:bg-brand-600' : 'text-ink-muted hover:bg-ink/[0.04] hover:text-ink')}><Icon className="h-4 w-4 opacity-70" />{label}</NavLink>)}</nav>
      <div className="mt-auto border-t border-line px-2 pt-4 text-sm">
        <div className="flex items-center gap-2.5"><Avatar name={user.name} size="sm" /><p className="font-medium">{user.name}</p></div>
        <p className="text-ink-muted">{ROLE_LABEL[user.role]}{user.region?.cities?.length > 0 && ` · ${user.region.cities.slice(0, 3).join(', ')}`}</p>
        <button className="mt-3 flex items-center gap-2 text-ink-muted hover:text-ink" onClick={async () => { await logout(); navigate('/staff/login'); }}><LogOut className="h-4 w-4" />Sign out</button>
      </div>
    </div>
  );
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 flex-none border-r border-line bg-white lg:block">{sidebar}</aside>
      {open && <div className="fixed inset-0 z-40 bg-ink/40 lg:hidden" onClick={() => setOpen(false)}><aside className="h-full w-72 bg-white" onClick={event => event.stopPropagation()}>{sidebar}</aside></div>}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-white px-4 sm:px-8">
          <button className="rounded-md p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Menu"><Menu /></button>
          <div className="lg:hidden"><Logo to={HOME_FOR_ROLE[user.role]} /></div>
          <p className="hidden text-sm text-ink-muted lg:block"><span className="font-medium text-ink">{new Date().toLocaleDateString('en-IN', { weekday: 'long' })}</span>, {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })} · {ROLE_LABEL[user.role]}</p>
          <div className="ml-auto flex items-center gap-2"><NotificationBell to="/inbox" /><span className="hidden items-center gap-2 border-l border-line pl-3 sm:flex"><Avatar name={user.name} size="sm" /><span className="text-sm font-medium">{user.name}</span></span></div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-8"><Boundary /></main>
      </div>
    </div>
  );
}

export function RequireRole({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to={roles.includes('customer') ? '/login' : '/staff/login'} state={{ from: location.pathname }} replace />;
  if (!roles.includes(user.role) && !(user.role === 'super_admin' && !roles.includes('customer'))) return <Navigate to={HOME_FOR_ROLE[user.role]} replace />;
  return children;
}

// Demo only: switch between seeded actors in one click (owner, partner, field, KYC officer, operations).
export function RoleSwitcher() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { api.get('/auth/demo-accounts').then(({ data }) => setAccounts(data.enabled ? data.accounts : [])).catch(() => setAccounts([])); }, []);
  if (!accounts?.length) return null;
  const switchTo = async account => {
    await api.post('/auth/demo-login', { userId: account.id });
    const next = await refresh();
    setOpen(false);
    navigate(HOME_FOR_ROLE[next?.role || account.role]);
  };
  const groups = accounts.reduce((map, account) => ({ ...map, [account.role]: [...(map[account.role] || []), account] }), {});
  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end">
      {open && (
        <div className="mb-2 max-h-[70vh] w-72 overflow-y-auto rounded-lg border border-line bg-white p-2 shadow-pop">
          <p className="mb-1 px-2 pt-1 text-sm font-medium">View the demo as</p>
          {Object.entries(groups).map(([role, list]) => (
            <div key={role} className="mb-2"><p className="px-2 pt-2 text-xs text-ink-faint">{ROLE_LABEL[role]}</p>
              {list.map(account => <button key={account.id} onClick={() => switchTo(account)} className={cx('flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-paper', user?.id === account.id && 'bg-ink/[0.06] font-medium')}><span className="font-medium">{account.name}</span><span className="truncate pl-2 text-xs text-ink-faint">{account.cities.slice(0, 2).join(', ')}</span></button>)}
            </div>
          ))}
        </div>
      )}
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-md border border-ink/10 bg-white px-3 py-2 text-sm font-medium text-ink-soft shadow-pop hover:text-ink"><Users className="h-4 w-4" /><span className={open ? '' : 'hidden sm:inline'}>{open ? 'Close' : 'Demo: view as…'}</span></button>
    </div>
  );
}
