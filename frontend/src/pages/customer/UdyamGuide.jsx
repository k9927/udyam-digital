import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Landmark, Copy, Check, ExternalLink, HandHelping, ShieldCheck, Info } from 'lucide-react';
import { api, errorMessage } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../i18n/index.jsx';
import { Alert, Badge, Button, Card, LoadState, PageHeader, useLoad, useToast } from '../../components/ui.jsx';

// The Udyam assistant: Udyam is free and Aadhaar-based, so the fastest way for an unregistered owner to be verified
// is to register there (about 10 minutes) and come back with the number.
export default function UdyamGuide() {
  const { t } = useLanguage();
  const { refresh } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const state = useLoad(async () => (await api.get('/kyc/udyam-assist')).data);
  const [copied, setCopied] = useState('');
  const [number, setNumber] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState('');
  const [helpSent, setHelpSent] = useState(false);

  const copy = async (key, value) => { try { await navigator.clipboard.writeText(value); setCopied(key); setTimeout(() => setCopied(''), 1500); } catch { /* clipboard blocked */ } };
  const openPortal = async portal => { window.open(portal, '_blank', 'noopener'); try { await api.post('/kyc/udyam-assist'); } catch { /* the reminder is best-effort */ } };
  const verify = async event => {
    event.preventDefault();
    setBusy('verify');
    try {
      await api.post('/kyc/consent');
      await api.post('/kyc/udyam', { udyam: number });
      await refresh();
      toast(t('kyc.registryOk'));
      navigate('/app/kyc');
    } catch (error) { toast(errorMessage(error), 'error'); } finally { setBusy(''); }
  };
  const askHelp = async () => { setBusy('help'); try { await api.post('/kyc/registration-help'); setHelpSent(true); } catch (error) { toast(errorMessage(error), 'error'); } finally { setBusy(''); } };

  return (
    <LoadState state={state}>
      {({ guide }) => {
        const { prefill } = guide;
        const rows = [['ownerName', t('login.name'), prefill.ownerName], ['businessName', t('ureg.name'), prefill.businessName], ['address', t('ureg.address'), [prefill.address, prefill.city, prefill.state].filter(Boolean).join(', ')], ['activity', t('ureg.activity'), prefill.activity]].filter(([, , value]) => value);
        return (
          <div className="space-y-6">
            <PageHeader eyebrow={t('ug.eyebrow')} title={t('ug.title')} subtitle={t('ug.subtitle')} />
            <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_1fr]">
              <div className="space-y-4">
                <Card className="p-5">
                  <p className="eyebrow mb-3">{t('ug.ready')}</p>
                  <ul className="space-y-2 text-sm">{['ug.r1', 'ug.r2', 'ug.r3', 'ug.r4'].map(key => <li key={key} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 flex-none text-ok-600" />{t(key)}</li>)}</ul>
                </Card>
                <Card className="p-5">
                  <p className="eyebrow mb-3">{t('ug.steps')}</p>
                  <ol className="space-y-3 text-sm">{['ug.s1', 'ug.s2', 'ug.s3', 'ug.s4', 'ug.s5'].map((key, index) => <li key={key} className="flex gap-3"><span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{index + 1}</span>{t(key)}</li>)}</ol>
                  <Button variant="secondary" className="mt-4" onClick={() => openPortal(guide.portal)}><Landmark className="h-4 w-4" />{t('ug.open')}<ExternalLink className="h-4 w-4" /></Button>
                  <p className="mt-2 text-xs text-ink-muted">{t('ug.reminder')}</p>
                </Card>
                <Alert tone="info"><span className="flex gap-2"><Info className="mt-0.5 h-4 w-4 flex-none" />{t('ug.gstNote')}</span></Alert>
              </div>
              <div className="space-y-4">
                <Card className="p-5">
                  <p className="eyebrow mb-3">{t('ug.prefill')}</p>
                  {rows.length ? <dl className="space-y-2 text-sm">{rows.map(([key, label, value]) => <div key={key} className="flex items-start justify-between gap-3 rounded-lg bg-paper px-3 py-2"><div><dt className="text-xs text-ink-muted">{label}</dt><dd className="font-semibold">{value}</dd></div><button type="button" onClick={() => copy(key, value)} className="flex-none rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold">{copied === key ? <Check className="h-4 w-4 text-ok-600" /> : <span className="flex items-center gap-1"><Copy className="h-3.5 w-3.5" />{t('ug.copy')}</span>}</button></div>)}</dl> : <p className="text-sm text-ink-muted">—</p>}
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg bg-paper px-3 py-2 text-sm"><p className="text-xs text-ink-muted">{t('ug.nic')}</p><p className="font-semibold">{prefill.nic.code}</p><p className="text-xs text-ink-muted">{prefill.nic.label}</p></div>
                    <div className="rounded-lg bg-paper px-3 py-2 text-sm"><p className="text-xs text-ink-muted">{t('ug.type')}</p><p className="font-semibold">{prefill.enterpriseType}</p></div>
                  </div>
                </Card>
                <Card className="border-l-[3px] border-l-ok-600 p-5">
                  <div className="flex items-center gap-2"><p className="font-semibold">{t('ug.done')}</p></div>
                  <p className="mt-1 text-sm text-ink-muted">{t('ug.doneHint')}</p>
                  <form className="mt-3 grid gap-2" onSubmit={verify}>
                    <input className="input font-mono uppercase" placeholder={t('kyc.udyamHint')} value={number} onChange={event => setNumber(event.target.value.toUpperCase())} aria-label={t('kyc.udyam')} autoComplete="off" />
                    <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-ink" checked={agree} onChange={event => setAgree(event.target.checked)} />{t('ug.consent')}</label>
                    <Button type="submit" loading={busy === 'verify'} disabled={!agree || number.length < 15}>{t('ug.verify')}</Button>
                  </form>
                </Card>
                <Card className="flex items-center gap-3 p-4">
                  
                  <p className="flex-1 text-sm">{t('ug.help')}</p>
                  {helpSent ? <Badge tone="green">{t('order.callbackDone')}</Badge> : <Button size="sm" variant="secondary" loading={busy === 'help'} onClick={askHelp}>{t('kyc.partner')}</Button>}
                </Card>
              </div>
            </div>
          </div>
        );
      }}
    </LoadState>
  );
}
