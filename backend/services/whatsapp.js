// The WhatsApp assistant: the same advisor, pricing, tracking and partner hand-off as the website, one message at a time.
// Inbound messages arrive from the Meta webhook or the demo simulator; both call handleInbound.
import { WaSession, WaMessage, User, Business, Order, Quote, Case } from '../models/index.js';
import { understand } from '../libs/advisorNlu.js';
import { buildQuote, normaliseProfile } from '../libs/pricing.js';
import { randomToken, encrypt, maskPhone } from '../libs/security.js';
import { waText, WA_LANGUAGES, detectLanguage } from '../libs/whatsappCopy.js';
import { config } from '../libs/config.js';
import { getCatalogue } from './reference.js';
import { isVerified } from './kycService.js';
import { openCase, languageName } from './routing.js';
import { sendWhatsApp } from './whatsappOutbox.js';
import { milestones } from '../controllers/orderController.js';
// The advisor's questions and the order-status names are shared with the website, so both channels say the same thing.
import { getAdvisorCopy } from '../../frontend/src/lib/advisorLocales.js';
import en from '../../frontend/src/i18n/en.js';
import hi from '../../frontend/src/i18n/locales/hi.js';
import mr from '../../frontend/src/i18n/locales/mr.js';
import ta from '../../frontend/src/i18n/locales/ta.js';
import te from '../../frontend/src/i18n/locales/te.js';
import kn from '../../frontend/src/i18n/locales/kn.js';
import gu from '../../frontend/src/i18n/locales/gu.js';
import bn from '../../frontend/src/i18n/locales/bn.js';
import ml from '../../frontend/src/i18n/locales/ml.js';
import pa from '../../frontend/src/i18n/locales/pa.js';

const UI = { en, hi, mr, ta, te, kn, gu, bn, ml, pa };
const statusName = (language, status) => UI[language.slice(0, 2)]?.[`os.${status}`] || en[`os.${status}`] || status;
const siteUrl = () => config.clientUrl.split(',')[0].trim().replace(/\/$/, '');
const shortDate = value => (value ? new Date(value).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : '—');

const GREETING = /^(hi+|hello|hey|menu|start|help|namaste|namaskar|नमस्ते|नमस्कार|வணக்கம்|నమస్కారం|ನಮಸ್ಕಾರ|નમસ્તે|নমস্কার|നമസ്കാരം|ਸਤ ਸ੍ਰੀ ਅਕਾਲ)[\s!.]*$/i;
const TRACK = /\b(track|status|where is my order)\b|ट्रैक|स्थिति|ट्रॅक/i;
const HUMAN = /\b(human|agent|person|call me|callback|talk to)\b|बात करनी|कॉल करो/i;
const LANGUAGE = /\b(language|bhasha)\b|भाषा|மொழி|భాష|ಭಾಷೆ|ભાષા|ভাষা|ഭാഷ|ਭਾਸ਼ਾ/i;

const menuChoices = language => [['menu:find', 'find'], ['menu:track', 'track'], ['menu:human', 'human'], ['menu:lang', 'language']].map(([id, key]) => ({ id, label: waText(language, key) }));

function flowFor(language) {
  return getAdvisorCopy(language).flow;
}

function question(session) {
  const step = flowFor(session.language).find(item => !session.answered.includes(item.key));
  if (!step) return null;
  session.pending = step.key;
  return { text: step.prompt, choices: step.choices.map(([value, label]) => ({ id: `ans:${step.key}:${value}`, label })) };
}

function apply(session, updates) {
  session.profile = { ...session.profile, ...updates };
  if (updates.business === 'multi' && !updates.sites && !session.answered.includes('sites')) session.profile.sites = Math.max(2, Number(session.profile.sites) || 2);
  session.answered = [...new Set([...session.answered, ...Object.keys(updates)])];
  session.markModified('profile');
}

function startAdvisor(session) {
  Object.assign(session, { state: 'advisor', profile: {}, answered: [], wants: [], budget: undefined, pending: undefined, quote: undefined });
  session.markModified('profile');
}

async function priceIt(session, user) {
  const business = user ? await Business.findOne({ owner: user._id }).lean() : null;
  const gstVerified = isVerified(business) && business.kyc.tier === 'gst';
  const profile = normaliseProfile(session.profile);
  const result = buildQuote({ profile, catalogue: await getCatalogue(), gstVerified, wants: session.wants, budget: session.budget ?? null });
  const quote = await Quote.create({ profile: result.profile, wants: session.wants, budget: session.budget ?? null, enabledAddons: result.enabledAddons, result, language: session.language, accessToken: randomToken(), mode: 'new', owner: user?._id, business: business?._id });
  session.quote = quote._id;
  session.state = 'quoted';
  const items = result.items.map(item => `• ${item.name}${item.quantity > 1 ? ` × ${item.quantity}` : ''}`).join('\n');
  const rupees = value => `₹${Math.round(value).toLocaleString('en-IN')}`;
  return {
    text: waText(session.language, 'quote', {
      bundle: result.bundleName, items, monthly: rupees(result.totals.monthly), months: result.totals.commitmentMonths, due: rupees(result.totals.dueNow),
      note: result.notes.some(note => note.code === 'gst_unlocks') ? waText(session.language, 'gstNote') : '', link: `${siteUrl()}/quote/${quote._id}?t=${quote.accessToken}`,
    }),
    choices: [{ id: 'q:order', label: waText(session.language, 'orderBtn') }, { id: 'q:restart', label: waText(session.language, 'restart') }, { id: 'menu:human', label: waText(session.language, 'human') }],
  };
}

async function track(session, user) {
  const order = user && (await Order.findOne({ owner: user._id, status: { $ne: 'cancelled' } }).sort({ createdAt: -1 }));
  if (!order) return [{ text: waText(session.language, 'noOrder'), choices: [{ id: 'menu:find', label: waText(session.language, 'find') }] }];
  const live = milestones(order).find(step => step.status === 'active')?.at;
  return [{ text: waText(session.language, 'status', { ref: order.ref, status: statusName(session.language, order.status), date: shortDate(order.activatedAt || live), link: `${siteUrl()}/app/orders/${order._id}` }) }];
}

async function callMe(session, user, name) {
  if (session.callbackCaseAt && Date.now() - session.callbackCaseAt.getTime() < 24 * 3600_000) return [{ text: waText(session.language, 'humanAgain') }];
  const business = user ? await Business.findOne({ owner: user._id }).lean() : null;
  const who = name || user?.name || maskPhone(session.phone);
  const profile = session.answered.length ? normaliseProfile(session.profile) : null;
  const item = await openCase({
    kind: 'callback', business: business?._id, title: `${who}${session.city ? ` (${session.city})` : ''} asked for a call on WhatsApp`,
    reason: profile ? `Advisor so far: ${profile.business}, ${profile.employees} people, ${profile.sites} site(s), tier ${profile.tier}, GST ${profile.gstin}` : 'Wants help choosing a bundle',
    city: session.city || business?.city, state: business?.state, language: session.language, ownerId: user?._id,
  });
  await Case.updateOne({ _id: item._id }, { $set: { contactEnc: encrypt(session.phone), contactName: who } });
  session.callbackCaseAt = new Date();
  return [{ text: waText(session.language, 'humanDone', { language: languageName(session.language) }) }];
}

// One inbound message in, one or more replies out. `choice` is a button/list id; plain text is understood like the web advisor.
export async function handleInbound({ phone, text = '', choice = null, name = '' }, { delivery = 'simulated' } = {}) {
  const body = String(text || '').trim().slice(0, 600);
  await WaMessage.create({ phone, direction: 'in', text: body || choice || '', delivery: delivery === 'simulated' ? 'simulated' : 'received' });
  const session = (await WaSession.findOne({ phone })) || new WaSession({ phone });
  const user = await User.findOne({ phone, role: 'customer' }).lean();
  if (!session.language) session.language = user?.preferredLanguage || detectLanguage(body) || 'en-IN';
  const language = () => session.language;
  const replies = [];
  const menu = () => replies.push({ text: waText(language(), 'menu'), choices: menuChoices(language()) });

  // Replying with an option's number ("2") or its label ("skip") picks that option.
  let picked = choice;
  if (!picked && body) {
    const options = session.state === 'language' ? WA_LANGUAGES.map(([code, label]) => ({ id: `lang:${code}`, label }))
      : session.state === 'menu' ? menuChoices(language())
        : session.state === 'quoted' ? ['q:order', 'q:restart', 'menu:human'].map(id => ({ id, label: waText(language(), { 'q:order': 'orderBtn', 'q:restart': 'restart', 'menu:human': 'human' }[id]) }))
          : (flowFor(language()).find(step => step.key === session.pending)?.choices || []).map(([value, label]) => ({ id: `ans:${session.pending}:${value}`, label }));
    const typed = body.toLocaleLowerCase().replace(/[.!]+$/, '');
    picked = (/^\d{1,2}$/.test(body) ? options[Number(body) - 1]?.id : options.find(option => option.label.toLocaleLowerCase() === typed)?.id) || null;
  }

  if (picked?.startsWith('lang:')) {
    session.language = WA_LANGUAGES.some(([code]) => code === picked.slice(5)) ? picked.slice(5) : 'en-IN';
    session.state = 'menu';
    if (user) await User.updateOne({ _id: user._id }, { $set: { preferredLanguage: session.language } });
    replies.push({ text: waText(language(), 'languageSet') });
    menu();
  } else if (picked === 'menu:lang' || (!picked && LANGUAGE.test(body))) {
    session.state = 'language';
    replies.push({ text: waText(language(), 'pickLanguage'), choices: WA_LANGUAGES.map(([code, label]) => ({ id: `lang:${code}`, label })) });
  } else if (picked === 'menu:track' || (!picked && TRACK.test(body))) {
    replies.push(...(await track(session, user)));
  } else if (picked === 'menu:human' || (!picked && HUMAN.test(body))) {
    replies.push(...(await callMe(session, user, name)));
  } else if (picked === 'q:order' && session.quote) {
    const quote = await Quote.findById(session.quote).lean();
    replies.push({ text: waText(language(), 'order', { link: `${siteUrl()}/quote/${quote._id}?t=${quote.accessToken}` }) });
  } else if (picked === 'menu:find' || picked === 'q:restart') {
    startAdvisor(session);
    replies.push({ text: waText(language(), 'describe') }, question(session));
  } else if (!picked && GREETING.test(body)) {
    session.state = 'menu';
    menu();
  } else {
    // An answer button, or free text: either way the advisor learns from it.
    let learned = false;
    if (picked?.startsWith('ans:')) {
      const [, key, value] = picked.split(':');
      apply(session, { [key]: key === 'spend' ? (value === 'skip' ? '' : value) : value });
      learned = true;
    } else if (body) {
      const result = understand(body);
      if (result.recognized) {
        apply(session, result.updates);
        session.wants = [...new Set([...session.wants, ...result.wants])];
        if (result.budget) session.budget = result.budget;
        if (result.city) session.city = result.city;
        learned = true;
      }
    }
    if (learned && session.state !== 'advisor' && session.state !== 'quoted') session.state = 'advisor';
    if (!learned) {
      replies.push({ text: waText(language(), 'fallback') });
      if (session.state === 'advisor') replies.push(question(session)); else if (session.state !== 'quoted') menu();
    } else {
      const next = question(session);
      replies.push(next || (await priceIt(session, user)));
    }
  }

  await session.save();
  const sent = [];
  for (const reply of replies.filter(Boolean)) sent.push(await sendWhatsApp(phone, reply));
  return sent;
}
