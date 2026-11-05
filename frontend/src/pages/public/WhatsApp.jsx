import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCheck, MessageCircle, RotateCcw, SendHorizontal, ShieldCheck, Smartphone } from 'lucide-react';
import { api, errorMessage } from '../../api/client.js';
import { Badge, Button, Card, Field, useToast } from '../../components/ui.jsx';

// Demo numbers: a brand-new owner, and seeded customers whose order updates already arrived on WhatsApp.
const PRESETS = [['9822233344', 'New business owner'], ['9876500001', 'Sneha Rao · Saffron Bakers (live)'], ['9876500003', 'Joseph Singh · Ganesh Woodcraft (packing)']];
const STARTERS = ['Hi', 'Pharmacy in Pune with 3 staff, we have GST', 'मेरी दुकान में 3 लोग हैं, जीएसटी नहीं है', 'Track my order', 'Talk to a person'];

// WhatsApp-style text: *bold*, line breaks, and links (links to this site open in-app).
function Rich({ text }) {
  return text.split('\n').map((line, row) => (
    <Fragment key={row}>
      {row > 0 && <br />}
      {line.split(/(https?:\/\/\S+|\*[^*\n]+\*)/g).map((part, index) => {
        if (/^\*[^*]+\*$/.test(part)) return <strong key={index}>{part.slice(1, -1)}</strong>;
        if (/^https?:\/\//.test(part)) {
          const url = new URL(part);
          const internal = /^\/(quote|app|login|track|advisor)/.test(url.pathname);
          return internal ? <Link key={index} to={url.pathname + url.search} className="break-all text-sky-700 underline">{part}</Link> : <a key={index} href={part} target="_blank" rel="noreferrer" className="break-all text-sky-700 underline">{part}</a>;
        }
        return <Fragment key={index}>{part}</Fragment>;
      })}
    </Fragment>
  ));
}

const time = value => new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

export default function WhatsApp() {
  const toast = useToast();
  const [phone, setPhone] = useState(PRESETS[0][0]);
  const [messages, setMessages] = useState([]);
  const [live, setLive] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scroller = useRef(null);
  const valid = /^[6-9]\d{9}$/.test(phone);

  const load = useCallback(async () => {
    if (!valid) return;
    try { const { data } = await api.get('/whatsapp/sim/thread', { params: { phone } }); setMessages(data.messages); setLive(data.live); } catch { /* keep the last thread */ }
  }, [phone, valid]);

  // Order updates arrive by themselves, so keep the thread fresh.
  useEffect(() => {
    if (!valid) return undefined;
    api.get('/whatsapp/sim/thread', { params: { phone } }).then(({ data }) => { setMessages(data.messages); setLive(data.live); }).catch(() => setMessages([]));
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [phone, valid, load]);
  useLayoutEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [messages.length]);

  const send = async ({ text: body = '', choice = null }) => {
    if (!valid || sending || (!body.trim() && !choice)) return;
    setSending(true);
    setMessages(current => [...current, { id: `pending-${Date.now()}`, direction: 'in', text: body || choice, at: new Date().toISOString(), pending: true }]);
    setText('');
    try { const { data } = await api.post('/whatsapp/sim/messages', { phone, text: body, choice }); setMessages(data.messages); } catch (error) { toast(errorMessage(error), 'error'); await load(); } finally { setSending(false); }
  };
  const reset = async () => { await api.delete('/whatsapp/sim/thread', { params: { phone } }); setMessages([]); };
  const lastOut = [...messages].reverse().find(message => message.direction === 'out');

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[400px_1fr] lg:py-12">
      <div className="mx-auto w-full max-w-[400px]">
        <div className="overflow-hidden rounded-[2rem] border-[6px] border-ink bg-ink shadow-pop">
          <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
            <ArrowLeft className="h-5 w-5 opacity-80" />
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white font-extrabold text-brand-600">a</div>
            <div className="min-w-0 flex-1"><p className="truncate font-semibold">Accel Business <ShieldCheck className="inline h-4 w-4 text-emerald-300" /></p><p className="text-xs opacity-80">{live ? 'WhatsApp Cloud API · live' : 'Business account · simulated'}</p></div>
          </div>
          <div ref={scroller} className="h-[min(60vh,560px)] space-y-2 overflow-y-auto bg-[#efeae2] px-3 py-4" aria-live="polite">
            {!messages.length && <p className="mx-auto max-w-[85%] rounded-lg bg-[#fff5c4] px-3 py-2 text-center text-xs text-ink-muted">Say “Hi”, or describe your business in your own words, in any of 10 languages.</p>}
            {messages.map(message => {
              const mine = message.direction === 'in';
              const isLast = message.id === lastOut?.id;
              return (
                <div key={message.id} className={mine ? 'flex justify-end' : 'flex justify-start'}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 text-[14px] leading-snug shadow-sm ${mine ? 'rounded-tr-none bg-[#d9fdd3]' : 'rounded-tl-none bg-white'} ${message.kind === 'notification' ? 'border-l-4 border-[#25d366]' : ''}`}>
                    <div className="whitespace-normal break-words text-ink"><Rich text={message.text} /></div>
                    <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-ink-faint">{time(message.at)}{mine && <CheckCheck className={`h-3.5 w-3.5 ${message.pending ? '' : 'text-sky-500'}`} />}</p>
                    {!mine && message.choices?.length > 0 && (
                      <div className={`-mx-3 -mb-2 mt-2 border-t border-line/70 ${message.choices.length > 3 ? 'grid' : 'grid divide-y divide-line/70'}`}>
                        {message.choices.map((choice, index) => <button key={choice.id} type="button" disabled={!isLast || sending} onClick={() => send({ text: choice.label, choice: choice.id })} className="px-3 py-2 text-left text-[13px] font-semibold text-[#008069] hover:bg-[#f5f5f5] disabled:font-normal disabled:text-ink-faint">{message.choices.length > 3 ? `${index + 1}. ` : ''}{choice.label}</button>)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {sending && <div className="flex justify-start"><div className="rounded-lg bg-white px-3 py-2 text-sm text-ink-faint shadow-sm">typing…</div></div>}
          </div>
          <form className="flex items-center gap-2 bg-[#f0f2f5] px-2 py-2" onSubmit={event => { event.preventDefault(); send({ text }); }}>
            <input className="min-w-0 flex-1 rounded-full border-0 bg-white px-4 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-[#25d366]" placeholder="Message" value={text} onChange={event => setText(event.target.value)} aria-label="Message" maxLength={600} />
            <button type="submit" disabled={!text.trim() || sending || !valid} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#00a884] text-white disabled:opacity-50" aria-label="Send"><SendHorizontal className="h-5 w-5" /></button>
          </form>
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <p className="eyebrow mb-1">WhatsApp front end</p>
          <h1 className="text-3xl font-extrabold">The whole journey, on the app owners already use</h1>
          <p className="mt-2 text-ink-muted">Find a bundle by chatting in any of 10 languages, get a priced quote with a link to order, track an order by your number, or ask for a local partner to call. Every order and verification update also arrives here.</p>
        </div>
        <Card className="space-y-4 p-5">
          <Field label="Chat as this mobile number">
            <div className="flex flex-wrap gap-2"><input className="input max-w-[12rem] font-mono" inputMode="numeric" value={phone} onChange={event => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))} /><Button variant="ghost" size="sm" onClick={reset} disabled={!valid}><RotateCcw className="h-4 w-4" />Clear chat</Button></div>
          </Field>
          <div className="flex flex-wrap gap-2">{PRESETS.map(([number, label]) => <button key={number} type="button" onClick={() => setPhone(number)} className={`rounded-full border px-3 py-1.5 text-sm ${phone === number ? 'border-[#00a884] bg-[#d9fdd3] font-semibold' : 'border-line bg-white hover:bg-paper'}`}>{label}</button>)}</div>
          <div><p className="mb-2 text-sm font-semibold">Try saying</p><div className="flex flex-wrap gap-2">{STARTERS.map(starter => <button key={starter} type="button" disabled={sending || !valid} onClick={() => send({ text: starter })} className="rounded-full bg-paper px-3 py-1.5 text-sm hover:bg-line/60 disabled:opacity-50">{starter}</button>)}</div></div>
        </Card>
        <Card className="space-y-3 p-5 text-sm text-ink-muted">
          <p className="flex items-center gap-2 font-semibold text-ink"><MessageCircle className="h-5 w-5 text-[#00a884]" />How it works</p>
          <p>This screen stands in for WhatsApp. It sends each message through the same conversation engine that serves the Meta WhatsApp Cloud API webhook (<code className="text-xs">/api/whatsapp/webhook</code>), with the same advisor, pricing rules and partner routing as the website.</p>
          <p>Documents are never collected in chat: the quote link opens the website, where they are read on the owner’s phone with consent.</p>
          <p className="flex items-center gap-2"><Smartphone className="h-4 w-4" />Status: <Badge tone={live ? 'green' : 'neutral'}>{live ? 'Connected to WhatsApp Cloud API' : 'Simulator (add WhatsApp keys to go live)'}</Badge></p>
        </Card>
      </div>
    </div>
  );
}
