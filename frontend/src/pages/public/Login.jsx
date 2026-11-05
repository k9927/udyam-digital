import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Smartphone } from 'lucide-react';
import { api, errorMessage } from '../../api/client.js';
import { useAuth, HOME_FOR_ROLE } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../i18n/index.jsx';
import { Alert, Button, Card, Field } from '../../components/ui.jsx';

export default function Login() {
  const { user, refresh } = useAuth();
  const { t, language } = useLanguage();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [devCode, setDevCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const next = params.get('next') || '/app';
  if (user && step === 'phone') return <Navigate to={user.role === 'customer' ? next : HOME_FOR_ROLE[user.role]} replace />;

  const send = async event => {
    event.preventDefault();
    setBusy(true); setError('');
    try { const { data } = await api.post('/auth/otp/request', { phone }); setDevCode(data.devCode || ''); setStep('code'); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  const verify = async event => {
    event.preventDefault();
    setBusy(true); setError('');
    try { await api.post('/auth/otp/verify', { phone, code, name: name || undefined, language }); await refresh(); navigate(next, { replace: true }); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Card className="p-6 sm:p-8">
        
        <h1 className="mt-4 text-2xl font-extrabold">{t('login.title')}</h1>
        <p className="mt-1 text-ink-muted">{t('login.subtitle')}</p>
        {error && <Alert tone="error" className="mt-4">{error}</Alert>}
        {step === 'phone' ? (
          <form onSubmit={send} className="mt-6 space-y-4">
            <Field label={t('login.phone')}><div className="flex"><span className="rounded-l-xl border border-r-0 border-line bg-paper px-3 py-2.5 text-ink-muted">+91</span><input className="input rounded-l-none" autoFocus required inputMode="numeric" autoComplete="tel-national" pattern="[6-9][0-9]{9}" maxLength={10} value={phone} onChange={event => setPhone(event.target.value.replace(/\D/g, ''))} placeholder="98765 43210" /></div></Field>
            <Button type="submit" className="w-full" size="lg" loading={busy}>{t('login.send')}</Button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-6 space-y-4">
            {devCode && <Alert tone="info">{t('login.devCode', { code: devCode })}</Alert>}
            <Field label={t('login.code')}><input className="input text-center text-xl tracking-[0.5em]" autoFocus required inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} /></Field>
            <Field label={`${t('login.name')} (${t('common.optional')})`}><input className="input" value={name} onChange={event => setName(event.target.value)} autoComplete="name" /></Field>
            <Button type="submit" className="w-full" size="lg" loading={busy}>{t('login.verify')}</Button>
            <button type="button" className="w-full text-sm font-semibold text-ink-muted hover:text-brand-700" onClick={() => { setStep('phone'); setError(''); }}>{t('login.change')}</button>
          </form>
        )}
      </Card>
    </div>
  );
}
