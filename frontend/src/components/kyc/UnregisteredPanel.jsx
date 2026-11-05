import { useState } from 'react';
import { Check, ArrowRight } from 'lucide-react';
import { api, errorMessage } from '../../api/client.js';
import { aadhaarValid } from '../../lib/aadhaar.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../i18n/index.jsx';
import { Alert, Button, Field, useToast } from '../ui.jsx';

// "Verify without registration": the owner declares the business, then proves who they are with Aadhaar e-KYC.
// Documents (a bill, plus a shop licence or shop photo) are added in the documents card below.
export default function UnregisteredPanel({ business, consent, verified, onBusiness, onSwitch }) {
  const { t } = useLanguage();
  const toast = useToast();
  const declared = business.registration?.declared;
  const [editing, setEditing] = useState(!declared);
  const [form, setForm] = useState(() => ({ name: declared?.name || '', address: declared?.address || '', city: declared?.city || business.city || '', state: declared?.state || business.state || '', activity: declared?.activity || '' }));
  const [aadhaar, setAadhaar] = useState('');
  const [otp, setOtp] = useState({ sentTo: '', devCode: '', code: '' });
  const [busy, setBusy] = useState('');
  const { user, refresh } = useAuth();
  const [fullName, setFullName] = useState('');

  const run = async (key, task) => {
    setBusy(key);
    try { await task(); } catch (error) { toast(errorMessage(error), 'error'); } finally { setBusy(''); }
  };
  const save = event => { event.preventDefault(); run('declare', async () => { const { data } = await api.post('/kyc/unregistered', form); onBusiness(data.business); setEditing(false); }); };
  const sendOtp = () => run('otp', async () => { const { data } = await api.post('/kyc/owner/otp', { aadhaar }); setOtp({ sentTo: data.sentTo, devCode: data.devCode || '', code: '' }); });
  const verifyOtp = event => { event.preventDefault(); run('verify', async () => { const { data } = await api.post('/kyc/owner/verify', { aadhaar, code: otp.code, ...(user?.name ? {} : { name: fullName }) }); if (!user?.name) refresh(); onBusiness(data.business); setAadhaar(''); setOtp({ sentTo: '', devCode: '', code: '' }); }); };
  const field = (key, label, props = {}) => <Field label={label}><input className="input" value={form[key]} disabled={!consent} onChange={event => setForm({ ...form, [key]: event.target.value })} {...props} /></Field>;
  const spaced = digits => digits.replace(/(\d{4})(?=\d)/g, '$1 ');

  return (
    <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
      <div>
        <div className="mb-3"><p className="font-medium">{t('ureg.businessTitle')}</p><p className="text-sm text-ink-muted">{t('ureg.businessHint')}</p></div>
        {editing ? (
          <form className="grid gap-3" onSubmit={save}>
            {field('name', t('ureg.name'), { required: true, minLength: 2, maxLength: 80 })}
            {field('address', t('ureg.address'), { required: true, minLength: 8, maxLength: 200 })}
            <div className="grid grid-cols-2 gap-3">{field('city', t('ureg.city'), { required: true })}{field('state', t('ureg.state'), { required: true })}</div>
            {field('activity', t('ureg.activity'), { maxLength: 120 })}
            <Button type="submit" loading={busy === 'declare'} disabled={!consent}>{t('ureg.save')}</Button>
          </form>
        ) : (
          <div className="border-l-2 border-ok-600 py-1 pl-3 text-sm">
            <p className="font-medium">{declared?.name}</p>
            <p className="text-ink-muted">{[declared?.address, !declared?.address?.includes(declared?.city) && declared?.city, declared?.state].filter(Boolean).join(', ')}</p>
            {declared?.activity && <p className="text-ink-muted">{declared.activity}</p>}
            {!verified && <button type="button" className="mt-1 text-[13px] text-ink-muted underline hover:text-ink" onClick={() => setEditing(true)}>{t('ureg.edit')}</button>}
          </div>
        )}
      </div>

      <div>
        <div className="mb-3"><p className="font-medium">{t('ureg.ownerTitle')}</p><p className="text-sm text-ink-muted">{t('ureg.ownerHint')}</p></div>
        {business.ownerKyc ? (
          <div className="flex items-start gap-2 border-l-2 border-ok-600 py-1 pl-3 text-sm"><Check className="mt-0.5 h-4 w-4 flex-none text-ok-600" /><p>{t('ureg.ownerDone', { name: business.ownerKyc.name, aadhaar: business.ownerKyc.aadhaar })}</p></div>
        ) : !declared ? (
          <p className="text-sm text-ink-muted">{t('ureg.declareFirst')}</p>
        ) : !otp.sentTo ? (
          <form onSubmit={event => { event.preventDefault(); sendOtp(); }}>
            <div className="flex gap-2">
            <input className="input font-mono tracking-wider" inputMode="numeric" autoComplete="off" placeholder="XXXX XXXX XXXX" aria-label={t('ureg.aadhaar')} aria-invalid={aadhaar.length === 12 && !aadhaarValid(aadhaar)} value={spaced(aadhaar)} disabled={!consent} onChange={event => setAadhaar(event.target.value.replace(/\D/g, '').slice(0, 12))} />
            <Button type="submit" variant="secondary" className="whitespace-nowrap" loading={busy === 'otp'} disabled={!consent || !aadhaarValid(aadhaar)}>{t('ureg.sendOtp')}</Button>
            </div>
            {aadhaar.length === 12 && !aadhaarValid(aadhaar) && <p role="alert" className="mt-2 text-sm text-brand-700">{t('ureg.aadhaarInvalid')}</p>}
          </form>
        ) : (
          <form className="grid gap-2" onSubmit={verifyOtp}>
            <p className="text-sm text-ink-muted">{t('ureg.otpSent', { to: otp.sentTo })}</p>
            {otp.devCode && <Alert tone="info">{t('login.devCode', { code: otp.devCode })}</Alert>}
            {!user?.name && <Field label={t('login.name')}><input className="input" required minLength={2} maxLength={80} autoComplete="name" value={fullName} onChange={event => setFullName(event.target.value)} /></Field>}
            <div className="flex gap-2"><input className="input font-mono tracking-[0.3em] placeholder:font-sans placeholder:tracking-normal" inputMode="numeric" autoComplete="one-time-code" placeholder={t('ureg.otp')} aria-label={t('ureg.otp')} value={otp.code} onChange={event => setOtp({ ...otp, code: event.target.value.replace(/\D/g, '').slice(0, 6) })} /><Button type="submit" loading={busy === 'verify'} disabled={otp.code.length < 6 || (!user?.name && fullName.trim().length < 2)}>{t('ureg.verifyOtp')}</Button></div>
          </form>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-4 md:col-span-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-muted">{t('ureg.upsell')}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" to="/app/udyam">{t('ureg.getUdyam')}<ArrowRight className="h-4 w-4" /></Button>
          {!verified && <Button variant="ghost" size="sm" onClick={onSwitch}>{t('ureg.switchRegistered')}</Button>}
        </div>
      </div>
    </div>
  );
}
