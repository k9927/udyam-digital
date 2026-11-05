import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../../api/client.js';
import { useAuth, HOME_FOR_ROLE } from '../../context/AuthContext.jsx';
import { Logo, ROLE_LABEL } from '../../components/Layout.jsx';
import { Alert, Button, Card, Field } from '../../components/ui.jsx';

export default function StaffLogin() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [demo, setDemo] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/auth/demo-accounts').then(({ data }) => setDemo(data)).catch(() => {}); }, []);
  const go = async () => { const user = await refresh(); navigate(HOME_FOR_ROLE[user?.role] || '/'); };
  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    try { await api.post('/auth/staff/login', form); await go(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  const quick = async account => { try { await api.post('/auth/demo-login', { userId: account.id }); await go(); } catch (err) { setError(errorMessage(err)); } };
  const staff = demo?.accounts?.filter(account => account.role !== 'customer') || [];
  return (
    <div className="min-h-screen bg-paper px-4 py-10">
      <div className="mx-auto max-w-5xl"><Logo />
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <Card className="p-6 sm:p-8">
            <h1 className="text-2xl font-extrabold">Staff & partner sign-in</h1>
            <p className="mt-1 text-ink-muted">Partners, field teams, KYC officers and operations.</p>
            {error && <Alert tone="error" className="mt-4">{error}</Alert>}
            <form onSubmit={submit} className="mt-6 space-y-4">
              <Field label="Work email"><input className="input" type="email" required autoComplete="username" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></Field>
              <Field label="Password"><input className="input" type="password" required autoComplete="current-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></Field>
              <Button type="submit" className="w-full" size="lg" loading={busy}>Sign in</Button>
            </form>
            <p className="mt-6 text-sm text-ink-muted">Business owner? <Link className="font-medium text-ink underline underline-offset-2" to="/login">Sign in with your mobile number</Link></p>
          </Card>
          {staff.length > 0 && (
            <Card className="p-6">
              <p className="eyebrow">Demo accounts</p>
              <p className="mt-1 text-sm text-ink-muted">One click to sign in as any actor. Password for all: <code className="rounded bg-paper px-1.5 py-0.5">{demo.password}</code></p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {staff.map(account => <button key={account.id} onClick={() => quick(account)} className="rounded-md border border-line p-3 text-left hover:border-ink"><p className="font-semibold">{account.name}</p><p className="text-xs text-ink-soft">{ROLE_LABEL[account.role]}</p><p className="mt-0.5 truncate text-xs text-ink-muted">{account.email}</p></button>)}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
