import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Plus, Minus } from 'lucide-react';
import { api, errorMessage } from '../../api/client.js';
import { useLanguage, LANGUAGES } from '../../i18n/index.jsx';
import PopularBundles from '../../components/PopularBundles.jsx';
import { Button, Field, useToast } from '../../components/ui.jsx';

function CallbackForm() {
  const { t, language } = useLanguage();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', phone: '', city: '', language });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    try { await api.post('/callback-requests', form); setDone(true); } catch (error) { toast(errorMessage(error), 'error'); } finally { setBusy(false); }
  };
  if (done) return <p className="rounded-md border border-ok-600/25 bg-ok-50 p-4 font-medium text-ok-700">{t('order.callbackDone')}</p>;
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <Field label={t('login.name')}><input className="input" required minLength={2} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></Field>
      <Field label={t('login.phone')}><input className="input" required inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value.replace(/\D/g, '') })} /></Field>
      <Field label="City"><input className="input" required value={form.city} onChange={event => setForm({ ...form, city: event.target.value })} /></Field>
      <Field label="Language"><select className="input" value={form.language} onChange={event => setForm({ ...form, language: event.target.value })}>{LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></Field>
      <Button type="submit" variant="dark" loading={busy} className="sm:col-span-2">{t('help.cta')}</Button>
    </form>
  );
}

export default function Landing() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [faq, setFaq] = useState(0);
  const [message, setMessage] = useState('');
  const start = event => {
    event.preventDefault();
    navigate('/advisor', { state: message.trim() ? { message: message.trim() } : undefined });
  };
  const steps = [['how.s1t', 'how.s1d'], ['how.s2t', 'how.s2d'], ['how.s3t', 'how.s3d'], ['how.s4t', 'how.s4d']];
  const trust = [['trust.consent', 'trust.consentD'], ['trust.device', 'trust.deviceD'], ['trust.bill', 'trust.billD'], ['trust.install', 'trust.installD']];
  return (
    <div>
      <section className="border-b border-line bg-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-12 sm:py-16 lg:grid-cols-[1.2fr_.8fr] lg:gap-16">
          <div>
            <h1 className="max-w-2xl text-[30px] font-semibold leading-[1.15] sm:text-5xl sm:leading-[1.08]">{t('hero.title')}</h1>
            <p className="mt-3 max-w-xl text-base text-ink-muted sm:mt-4 sm:text-lg">{t('hero.subtitle')}</p>
            <form onSubmit={start} className="mt-6 max-w-xl sm:mt-8">
              <label htmlFor="hero-message" className="label">{t('adv.title')}</label>
              <textarea id="hero-message" rows={3} maxLength={600} className="input resize-none text-base" placeholder={t('adv.typeHint')} value={message} onChange={event => setMessage(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) start(event); }} />
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
                <Button type="submit" size="lg">{t('hero.cta')}<ArrowRight className="h-5 w-5" /></Button>
                <Link to="/whatsapp" className="text-sm font-medium text-ink-soft underline decoration-line underline-offset-4 hover:decoration-ink">{t('wa.cta')}</Link>
                <Link to="/track" className="text-sm font-medium text-ink-soft underline decoration-line underline-offset-4 hover:decoration-ink">{t('hero.track')}</Link>
              </div>
            </form>
          </div>
          <div className="rounded-lg bg-paper p-6 lg:mt-1">
            <h2 className="text-base font-semibold">{t('how.title')}</h2>
            <ol className="mt-5">
              {steps.map(([title, body], index) => (
                <li key={title} className="relative flex gap-4 pb-6 last:pb-0">
                  {index < steps.length - 1 && <span className="absolute left-[13px] top-8 bottom-1 w-px bg-brand-200" />}
                  <span className="num relative grid h-7 w-7 flex-none place-items-center rounded-full bg-brand-600 text-[13px] font-semibold text-white">{index + 1}</span>
                  <div className="pt-0.5"><p className="font-medium">{t(title)}</p><p className="mt-0.5 text-sm text-ink-muted">{t(body)}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4">
        <div className="py-14"><PopularBundles /></div>

        <section className="grid gap-10 border-t border-line py-14 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold">{t('reg.title')}</h2>
            <p className="mt-3 max-w-lg text-ink-muted">{t('reg.body')}</p>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3"><Button to="/advisor" variant="dark">{t('hero.cta')}</Button><a href="https://udyamregistration.gov.in" target="_blank" rel="noreferrer" className="text-sm font-medium text-ink-soft underline decoration-line underline-offset-4 hover:decoration-ink">{t('reg.link')}</a></div>
          </div>
          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {trust.map(([title, body]) => <div key={title}><dt className="font-medium">{t(title)}</dt><dd className="mt-1 text-sm text-ink-muted">{t(body)}</dd></div>)}
          </dl>
        </section>

        <section className="grid gap-10 border-t border-line py-14 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold">{t('help.title')}</h2>
            <p className="mb-6 mt-2 max-w-lg text-ink-muted">{t('help.body')}</p>
            <CallbackForm />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">{t('faq.title')}</h2>
            <div className="mt-4 divide-y divide-line border-y border-line">
              {[1, 2, 3, 4].map(n => (
                <div key={n}>
                  <button className="flex w-full items-start justify-between gap-4 py-4 text-left font-medium" onClick={() => setFaq(faq === n ? 0 : n)} aria-expanded={faq === n}>{t(`faq.q${n}`)}{faq === n ? <Minus className="mt-0.5 h-4 w-4 flex-none text-ink-muted" /> : <Plus className="mt-0.5 h-4 w-4 flex-none text-ink-muted" />}</button>
                  {faq === n && <p className="-mt-1 pb-4 text-ink-muted">{t(`faq.a${n}`)}</p>}
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm"><Link to="/privacy" className="font-medium text-ink-soft underline decoration-line underline-offset-4 hover:decoration-ink">{t('footer.privacy')}</Link></p>
          </div>
        </section>
      </div>
    </div>
  );
}
