import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Check, X, AlertTriangle, Upload, Eye, Loader2, ArrowRight } from 'lucide-react';
import UnregisteredPanel from '../../components/kyc/UnregisteredPanel.jsx';
import { api, errorMessage } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../i18n/index.jsx';
import { readDocument } from '../../lib/kycOcr.js';
import { gstinChecksumValid } from '../../lib/kycParse.js';
import { longDate, dateTime } from '../../lib/format.js';
import { Alert, Badge, Button, Callout, Spinner, Steps, STATUS_TONE, useToast, cx } from '../../components/ui.jsx';

const DOCS = [['Address proof', true], ['Signatory ID', true], ['GST certificate', false], ['Udyam certificate', false]];
// Unregistered: a bill, plus a shop licence or a shop-front photo (either one is enough).
const UNREGISTERED_DOCS = [['Address proof', true], ['Shop licence', 'oneOf'], ['Shop photo', 'oneOf']];

// The demo's drawn documents are SVG; OCR reads pixels, so draw them onto a canvas first.
async function svgToPng(url, name) {
  const svg = await (await fetch(url)).text();
  const image = new Image();
  const blobUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = blobUrl; });
  const canvas = Object.assign(document.createElement('canvas'), { width: image.naturalWidth, height: image.naturalHeight });
  canvas.getContext('2d').drawImage(image, 0, 0);
  URL.revokeObjectURL(blobUrl);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  return new File([blob], name, { type: 'image/png' });
}
const SPECIMEN_TYPE = { gst_certificate: 'GST certificate', udyam_certificate: 'Udyam certificate', address_proof: 'Address proof', signatory_id: 'Signatory ID' };
const ICON = { pass: [Check, 'text-ok-600'], warn: [AlertTriangle, 'text-warn-600'], fail: [X, 'text-brand-600'] };

export default function Kyc() {
  const { t } = useLanguage();
  const { refresh } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [orders, setOrders] = useState([]);
  const [gstin, setGstin] = useState('');
  const [udyam, setUdyam] = useState('');
  const [reading, setReading] = useState({});
  const [busy, setBusy] = useState('');
  const [helpSent, setHelpSent] = useState(false);
  const [choice, setChoice] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const load = async () => {
    const [{ data: me }, { data: mine }] = await Promise.all([api.get('/business/me'), api.get('/orders/mine')]);
    setData(me);
    setOrders(mine.orders);
  };
  useEffect(() => {
    Promise.all([api.get('/business/me'), api.get('/orders/mine')])
      .then(([{ data: me }, { data: mine }]) => { setData(me); setOrders(mine.orders); })
      .catch(error => toast(errorMessage(error), 'error'));
  }, [toast]);

  const run = async (key, task) => {
    setBusy(key);
    try { await task(); } catch (error) { toast(errorMessage(error), 'error'); } finally { setBusy(''); }
  };
  const setBusiness = business => setData(current => ({ ...current, business }));
  const consent = checked => run('consent', async () => {
    if (checked) { const { data: given } = await api.post('/kyc/consent'); toast(t('kyc.consentActive', { time: dateTime(given.consent.expiresAt) })); }
    else { const { data: result } = await api.post('/kyc/consent/withdraw'); setBusiness(result.business); toast(`${t('kyc.withdraw')} ✓`); }
    await load();
  });
  // Registry errors with a code are shown in the owner's language; anything else falls back to the server's text.
  const registryError = error => {
    const details = error?.response?.data?.details;
    if (details?.code === 'registry_mismatch') return t('kyc.mismatch', { entered: `${details.entered.name} (${details.entered.place})`, current: `${details.current.name} (${details.current.place})`, existing: details.existing === 'udyam' ? 'Udyam' : 'GST' });
    if (details?.code === 'registry_locked') return t('kyc.locked', { masked: details.masked || '' });
    return errorMessage(error);
  };
  const lookup = async (kind, value) => {
    setBusy(kind);
    try {
      const { data: result } = await api.post(`/kyc/${kind}`, kind === 'gstin' ? { gstin: value } : { udyam: value });
      setBusiness(result.business);
      if (kind === 'gstin' && !result.active) toast(t('kyc.inactive', { status: result.status.toLowerCase() }), 'error'); else toast(t('kyc.registryOk'));
      await refresh();
    } catch (error) { toast(registryError(error), 'error'); } finally { setBusy(''); }
  };
  const removeRegistry = kind => run(`remove-${kind}`, async () => {
    const { data: result } = await api.delete(`/kyc/registry/${kind === 'gstin' ? 'gst' : 'udyam'}`);
    setBusiness(result.business);
    if (kind === 'gstin') setGstin(''); else setUdyam('');
    await refresh();
  });

  // Reads the document on this device, auto-fills the registry number it finds, then uploads file + fields.
  const addDocument = async (type, file) => {
    if (!data?.consent) { toast(t('kyc.consentCheck'), 'error'); return; }
    setReading(current => ({ ...current, [type]: true }));
    try {
      const ocr = await readDocument(file, type).catch(error => { console.warn('Could not read the document on this device:', error); return { confidence: 0, fields: {} }; });
      if (type === 'GST certificate' && ocr.fields.gstin && gstinChecksumValid(ocr.fields.gstin) && !data.business.gst) { setGstin(ocr.fields.gstin); await api.post('/kyc/gstin', { gstin: ocr.fields.gstin }).catch(error => toast(registryError(error), 'error')); }
      if (type === 'Udyam certificate' && ocr.fields.udyam_number && !data.business.udyam) { setUdyam(ocr.fields.udyam_number); await api.post('/kyc/udyam', { udyam: ocr.fields.udyam_number }).catch(error => toast(registryError(error), 'error')); }
      const form = new FormData();
      form.append('type', type);
      form.append('confidence', String(ocr.confidence));
      form.append('fields', JSON.stringify(ocr.fields));
      if (ocr.looksLike) form.append('looksLike', ocr.looksLike);
      form.append('file', file);
      const { data: result } = await api.post('/kyc/documents', form);
      setBusiness(result.business);
      await refresh();
    } catch (error) { toast(errorMessage(error), 'error'); } finally { setReading(current => ({ ...current, [type]: false })); }
  };
  const loadSpecimen = async applicant => run('specimen', async () => {
    const { data: list } = await api.get('/specimens');
    const files = (list.applicants[applicant] || []).sort((a, b) => (a.includes('gst') ? -1 : b.includes('gst') ? 1 : 0));
    for (const name of files) {
      const blob = await (await fetch(`/api/specimens/${name}`)).blob();
      await addDocument(SPECIMEN_TYPE[name.slice(4, -4)], new File([blob], name, { type: 'image/png' }));
    }
  });
  const askReview = () => run('review', async () => { const { data: result } = await api.post('/kyc/request-review'); setBusiness(result.business); toast(t('kyc.reviewSent')); });
  const askHelp = () => run('help', async () => { await api.post('/kyc/registration-help'); setHelpSent(true); });
  const loadShopSample = () => run('specimen', async () => {
    for (const [kind, type] of [['bill', 'Address proof'], ['licence', 'Shop licence'], ['photo', 'Shop photo']]) await addDocument(type, await svgToPng(`/api/kyc/demo-documents/${kind}`, `sample-${kind}.png`));
  });

  if (!data) return <Spinner />;
  const { business } = data;
  const status = business.kyc.status;
  const verified = status === 'verified';
  const registryOk = business.gst?.status === 'Active' || business.udyam;
  // Which path the owner is on: registered (GST/Udyam), unregistered (owner e-KYC), or not chosen yet.
  const mode = choice || (business.gst || business.udyam ? 'registered' : business.registration?.path === 'unregistered' ? 'unregistered' : null);
  const unregistered = mode === 'unregistered';
  const docs = unregistered ? UNREGISTERED_DOCS : DOCS;
  const registryMismatch = business.kyc.failed?.some(item => item.type === 'Registry');
  const docOf = type => business.documents.find(doc => doc.type === type);
  const waiting = orders.filter(order => ['awaiting_kyc', 'awaiting_signature'].includes(order.status));
  const openRequests = business.kyc.reviewRequests.filter(request => !request.resolved);

  // Step states: done steps fold to one line; only the step in front of the owner opens.
  const consentDone = verified || Boolean(data.consent);
  const businessDone = verified || (unregistered ? Boolean(business.ownerKyc && business.registration?.declared) : Boolean(registryOk));
  const docsDone = verified || status === 'in_review' || (business.documents.length > 0 && !business.kyc.missing.length && !business.documents.some(doc => doc.status === 'fail') && !['action_needed', 'registry_needed'].includes(status));
  const stateOf = (done, ready) => (done ? 'done' : ready ? 'current' : 'todo');
  const open = (state, key) => showAll || state === 'current' || (!verified && state === 'done' && key !== 'consent');
  const consentState = stateOf(consentDone, true);
  const businessState = stateOf(businessDone, consentDone);
  const docsState = stateOf(docsDone, consentDone && (businessDone || Boolean(mode)));
  const resultState = verified ? 'done' : status === 'action_needed' ? 'blocked' : docsDone ? 'current' : 'todo';
  const registryName = [business.gst && `${business.gst.tradeName} · GSTIN ${business.gst.masked}`, business.udyam && `${business.udyam.enterpriseName} · Udyam ${business.udyam.masked}`].filter(Boolean).join(' / ');

  const consentBody = (
    <div className="max-w-2xl">
      <p className="text-sm text-ink-soft">{t(unregistered ? 'ureg.consentBody' : 'kyc.consentBody')}</p>
      <ul className="mt-2 space-y-0.5 text-sm text-ink-muted">{['kyc.p1', 'kyc.p2', 'kyc.p3'].map(key => <li key={key} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 flex-none text-ok-600" />{t(key)}</li>)}</ul>
      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-md border border-[#cfcfca] bg-white p-3 hover:border-ink"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-ink" checked={Boolean(data.consent)} disabled={busy === 'consent'} onChange={event => consent(event.target.checked)} /><span className="text-sm font-medium">{t('kyc.consentCheck')}</span></label>
    </div>
  );

  const choiceBody = (
    <div className="max-w-2xl divide-y divide-line rounded-md border border-line bg-white">
      {[
        ['registered', t('ureg.yes'), t('kyc.subtitle')],
        ['udyam', t('ureg.getUdyam'), t('ureg.getUdyamBody')],
        ['unregistered', t('ureg.without'), t('ureg.withoutBody')],
      ].map(([key, title, body]) => {
        const inner = <><div className="flex-1"><p className="font-medium">{title}</p><p className="mt-0.5 text-sm text-ink-muted">{body}</p></div><ArrowRight className="mt-1 h-4 w-4 flex-none text-ink-faint group-hover:text-ink" /></>;
        return key === 'udyam'
          ? <Link key={key} to="/app/udyam" className="group flex gap-4 p-4 hover:bg-paper/60">{inner}</Link>
          : <button key={key} type="button" onClick={() => setChoice(key)} className="group flex w-full gap-4 p-4 text-left hover:bg-paper/60">{inner}</button>;
      })}
    </div>
  );

  const registeredBody = (
    <div className="space-y-4">
      {registryMismatch && <Alert tone="error" title={t('kyc.mismatchTitle')}>{t('kyc.mismatchBody')}</Alert>}
      <div className="grid gap-5 md:grid-cols-2">
        {[['gstin', t('kyc.gst'), t('kyc.gstHint'), gstin, setGstin, business.gst], ['udyam', t('kyc.udyam'), t('kyc.udyamHint'), udyam, setUdyam, business.udyam]].filter(([kind, , , , , record]) => record || kind === 'gstin' || business.gst?.status !== 'Active').map(([kind, label, hint, value, setValue, record]) => (
          <div key={kind}>
            <p className="label">{label} <span className="font-normal text-ink-muted">· {t('common.optional')}</span></p>
            {record ? (
              <div className={cx('border-l-2 py-1 pl-3 text-sm', kind === 'gstin' && record.status !== 'Active' ? 'border-brand-600' : 'border-ok-600')}>
                <p className="font-medium">{kind === 'gstin' ? record.tradeName : record.enterpriseName}</p>
                <p className="text-ink-muted"><span className="font-mono text-[13px]">{record.masked}</span> · {kind === 'gstin' ? record.status : `${record.enterpriseType || ''} · ${record.city}`}</p>
                {kind === 'gstin' && <p className="text-ink-muted">{record.legalName} · {record.address}</p>}
                {kind === 'gstin' && record.status !== 'Active' && <p className="mt-1 font-medium text-brand-700">{t('kyc.inactive', { status: record.status.toLowerCase() })}</p>}
                {!verified && <button type="button" className="mt-1 text-[13px] text-ink-muted underline hover:text-ink" disabled={busy === `remove-${kind}`} onClick={() => removeRegistry(kind)}>{t('kyc.removeRegistry')}</button>}
              </div>
            ) : (
              <form className="flex gap-2" onSubmit={event => { event.preventDefault(); lookup(kind, value); }}>
                <input className="input font-mono uppercase" placeholder={hint} aria-label={label} value={value} disabled={!data.consent} onChange={event => setValue(event.target.value.toUpperCase())} autoComplete="off" />
                <Button type="submit" variant="secondary" loading={busy === kind} disabled={!data.consent || !value}>{t('kyc.check')}</Button>
              </form>
            )}
          </div>
        ))}
      </div>
      {!registryOk && (
        <div className="flex flex-col gap-3 border-t border-line pt-4 text-sm sm:flex-row sm:items-center">
          <p className="flex-1 text-ink-muted"><span className="font-medium text-ink">{t('kyc.noReg')}</span> {t('ureg.withoutBody')}</p>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => setChoice(null)}>{t('ureg.no')}</Button><Button size="sm" variant="ghost" loading={busy === 'help'} disabled={helpSent} onClick={askHelp}>{helpSent ? t('order.callbackDone') : t('kyc.partner')}</Button></div>
        </div>
      )}
    </div>
  );

  const docsBody = (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-muted">{unregistered ? t('ureg.docsHint') : t('kyc.docsHint')}</p>
        {unregistered ? (
          <Button variant="ghost" size="sm" loading={busy === 'specimen'} disabled={!data.consent || !business.registration?.declared} onClick={loadShopSample}>{t('ureg.demo')}</Button>
        ) : (
          <select className="input w-auto py-1.5 text-sm" value="" disabled={!data.consent || busy === 'specimen'} onChange={event => event.target.value && loadSpecimen(event.target.value)} aria-label={t('kyc.specimen')}>
            <option value="">{busy === 'specimen' ? t('kyc.reading') : t('kyc.specimen')}</option>
            {Array.from({ length: 12 }, (_, index) => `K${String(index + 1).padStart(2, '0')}`).map(code => <option key={code} value={code}>{code}</option>)}
          </select>
        )}
      </div>
      <ul className="divide-y divide-line rounded-md border border-line bg-white">
        {docs.map(([type, required]) => {
          const doc = docOf(type);
          const isReading = reading[type];
          const checks = doc?.checks.filter(check => check.label !== 'Document read') || [];
          return (
            <li key={type} className="p-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-[10rem] flex-1">
                  <p className="font-medium">{t(`doc.${type}`)}</p>
                  <p className="text-[13px] text-ink-muted">{required === true ? t('common.required') : required === 'oneOf' ? t('ureg.oneOf') : t('common.optional')}</p>
                </div>
                <div className="text-sm">
                  {isReading ? <span className="flex items-center gap-1.5 text-ink-muted"><Loader2 className="h-4 w-4 animate-spin" />{t('kyc.reading')}</span>
                    : doc ? <Badge tone={doc.status === 'pass' ? 'green' : status === 'in_review' ? 'blue' : doc.status === 'fail' ? 'red' : 'amber'}>{t(`kycs.${doc.status === 'pass' ? 'verified' : status === 'in_review' ? 'in_review' : doc.status === 'fail' ? 'action_needed' : 'in_review'}`)}</Badge> : null}
                </div>
                <div className="flex gap-2">
                  {doc?.hasFile && <a href={`/api/documents/${doc.id}/file`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-ink-muted hover:bg-ink/5 hover:text-ink"><Eye className="h-4 w-4" />{t('common.view')}</a>}
                  <label className={cx('inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[#cfcfca] bg-white px-3 py-1.5 text-sm font-medium hover:border-ink', (!data.consent || isReading) && 'pointer-events-none opacity-50')}><Upload className="h-4 w-4" />{doc ? t('kyc.replace') : t('kyc.choose')}<input type="file" className="sr-only" accept={type === 'Shop photo' ? 'image/jpeg,image/png,image/webp' : 'image/jpeg,image/png,image/webp,application/pdf'} capture={type === 'Shop photo' ? 'environment' : undefined} disabled={!data.consent || isReading} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) addDocument(type, file); }} /></label>
                </div>
              </div>
              {checks.length > 0 && (
                <ul className="mt-3 space-y-1.5 border-t border-dashed border-line pt-3">
                  {checks.map((check, index) => { const [Icon, color] = ICON[check.status]; return <li key={index} className="flex gap-2 text-sm"><Icon className={cx('mt-0.5 h-4 w-4 flex-none', color)} /><div><span className={cx(check.status === 'fail' && 'font-medium text-brand-800')}>{check.label}</span>{check.detail && <span className="text-ink-muted"> · {check.detail}</span>}</div></li>; })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {business.kyc.missing.length > 0 && business.documents.length > 0 && <p className="mt-3 text-sm text-warn-700">{business.kyc.missing.map(type => t(`doc.${type}`)).join(', ')}: {t('common.required')}</p>}
    </div>
  );

  const steps = [
    { key: 'consent', state: consentState, title: t('kyc.consentTitle'), summary: consentDone && !open(consentState, 'consent') ? (data.consent ? t('kyc.consentActive', { time: dateTime(data.consent.expiresAt) }) : t('kyc.p1')) : null, aside: data.consent && !verified && <button className="text-sm text-ink-muted underline hover:text-ink" onClick={() => consent(false)}>{t('kyc.withdraw')}</button>, children: open(consentState, 'consent') && consentBody },
    { key: 'business', state: businessState, title: unregistered ? t('ureg.stepOwner') : t('kyc.step1'), summary: businessDone && !unregistered ? registryName : businessDone ? business.name : !mode && businessState === 'current' ? t('ureg.question') : null, aside: mode && !businessDone && businessState !== 'todo' && <button className="text-sm text-ink-muted underline hover:text-ink" onClick={() => setChoice(null)}>{t('ureg.question')}</button>, children: open(businessState, 'business') && (!mode ? choiceBody : unregistered ? <UnregisteredPanel business={business} consent={Boolean(data.consent)} verified={verified} onBusiness={result => { setBusiness(result); refresh(); }} onSwitch={() => setChoice('registered')} /> : registeredBody) },
    { key: 'docs', state: docsState, title: t('kyc.docs'), summary: business.documents.length ? business.documents.map(doc => t(`doc.${doc.type}`)).join(' · ') : null, children: open(docsState, 'docs') && docsBody },
    { key: 'result', state: resultState, title: t('kyc.step3'), summary: verified ? `${t('kyc.verifiedTitle')} · ${t(`tier.${business.kyc.tier}`)}` : status === 'in_review' ? t('kyc.reviewSent') : status === 'action_needed' ? t('kycs.action_needed') : null, aside: status === 'action_needed' && <Button variant="secondary" size="sm" loading={busy === 'review'} onClick={askReview}>{t('kyc.askReview')}</Button> },
  ];

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-semibold sm:text-[28px]">{t('kyc.title')}</h1><p className="mt-1.5 text-ink-muted">{unregistered ? t('ureg.withoutBody') : t('kyc.subtitle')}</p></div>
        <Badge tone={STATUS_TONE[status]} className="text-sm">{t(unregistered && status === 'registry_needed' ? 'ureg.status' : `kycs.${status}`)}</Badge>
      </div>

      {verified && (
        <div className="mb-6 flex flex-col gap-4 rounded-lg border border-line border-l-[3px] border-l-ok-600 bg-ok-50 p-5 sm:flex-row sm:items-center">
          <ShieldCheck className="h-8 w-8 flex-none text-ok-600" />
          <div className="flex-1"><p className="text-lg font-semibold">{t('kyc.verifiedTitle')} · {t(`tier.${business.kyc.tier}`)}</p><p className="text-sm text-ink-soft">{t('kyc.verifiedBody', { date: longDate(business.kyc.expiresAt) })}</p></div>
          {waiting[0] && <Button to={`/app/orders/${waiting[0].id}`}>{t('kyc.backToOrder')}<ArrowRight className="h-4 w-4" /></Button>}
        </div>
      )}
      {status === 'action_needed' && business.kyc.failed?.length > 0 && (
        <Callout tone="action" className="mb-6">
          <p className="font-semibold">{t('kycs.action_needed')}</p>
          <ul className="mt-2 space-y-1 text-sm">{business.kyc.failed.map((item, index) => <li key={index} className="flex gap-2"><X className="mt-0.5 h-4 w-4 flex-none text-brand-600" /><span><span className="font-medium">{item.type === 'Registry' ? t('kyc.step1') : t(`doc.${item.type}`)}:</span> {item.label}</span></li>)}</ul>
          <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="secondary" loading={busy === 'review'} onClick={askReview}>{t('kyc.askReview')}</Button></div>
        </Callout>
      )}
      {openRequests.length > 0 && <div className="mb-6 space-y-2">{openRequests.map(request => <Alert key={request.at} tone="warning" title={t(`doc.${request.docType}`)}>{t('kyc.reviewerAsked', { message: request.message })}</Alert>)}</div>}

      <div className="card p-4 sm:p-6"><Steps items={steps} /></div>

      <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-muted">
        {verified && <button className="underline hover:text-ink" onClick={() => setShowAll(!showAll)}>{showAll ? t('common.close') : t('kyc.checks')}</button>}
        <span>Storage: {data.storage === 'r2' ? 'Cloudflare R2 (private bucket)' : 'local private storage'}</span>
        <Link to="/privacy" className="underline hover:text-ink">{t('footer.privacy')}</Link>
      </p>
    </div>
  );
}
