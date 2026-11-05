// The WhatsApp front end: advisor by chat, quote link, tracking by number, partner hand-off, languages, Meta webhook.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, dropDatabase, loginCustomer, loginDemo } from './helpers.js';
import { toCloudPayload, parseWebhook } from '../libs/whatsappCloud.js';

const DB = 'udyam_digital_wa_test';
await dropDatabase(DB);
const server = await startServer(5098, DB);
test.after(async () => { server.stop(); await dropDatabase(DB); });

const sim = server.actor();
const say = async (phone, text, choice = null) => {
  const before = (await sim.get(`/whatsapp/sim/thread?phone=${phone}`)).body.messages.length;
  const response = await sim.post('/whatsapp/sim/messages', { phone, text, choice });
  assert.equal(response.status, 200, response.text);
  return response.body.messages.slice(before + 1).filter(message => message.direction === 'out');
};

test('a new owner gets a priced bundle by chatting, and the link opens the quote', async () => {
  const phone = '9822233344';
  const [menu] = await say(phone, 'Hi');
  assert.deepEqual(menu.choices.map(choice => choice.id), ['menu:find', 'menu:track', 'menu:human', 'menu:lang']);
  const [next] = await say(phone, 'Pharmacy in Pune with 3 staff, we have GST, using a mobile hotspot, need billing');
  assert.match(next.text, /locations/);
  const [spend] = await say(phone, '1');
  assert.ok(spend.choices.some(choice => choice.id === 'ans:spend:skip'));
  const [quote] = await say(phone, 'skip');
  assert.match(quote.text, /Everyday Business Bundle/);
  assert.match(quote.text, /Biz 5G AirFiber 100/);
  assert.match(quote.text, /verified/, 'explains that a verified GSTIN unlocks more');
  const link = quote.text.match(/\/quote\/(\w+)\?t=([\w-]+)/);
  assert.ok(link, 'quote link with access token');
  assert.equal((await server.actor().get(`/quotes/${link[1]}`, { 'x-quote-token': link[2] })).status, 200);
  const [order] = await say(phone, 'Order now', 'q:order');
  assert.match(order.text, /sign in with this mobile number/);
});

test('an owner can answer only with buttons, and change their mind', async () => {
  const phone = '9822233355';
  await say(phone, 'Find a bundle', 'menu:find');
  for (const [key, value] of [['business', 'professional'], ['employees', '8'], ['sites', '2'], ['tier', '1'], ['gstin', 'no'], ['current', 'business'], ['goal', 'security']]) await say(phone, value, `ans:${key}:${value}`);
  const [quote] = await say(phone, 'Skip', 'ans:spend:skip');
  assert.match(quote.text, /Professional Growth Bundle/);
  assert.match(quote.text, /Endpoint Security/);
  const [refined] = await say(phone, 'actually we have 3 branches');
  assert.match(refined.text, /Professional Growth Bundle|Multi-site/, 'free text after a quote re-prices it');
});

test('Hindi is detected from the first message and the whole chat follows', async () => {
  const phone = '9822233366';
  const replies = await say(phone, 'मेरी दुकान में 3 लोग हैं, जीएसटी नहीं है');
  assert.match(replies.at(-1).text, /[ऀ-ॿ]/, 'reply in Devanagari');
  const [languages] = await say(phone, 'भाषा बदलें', 'menu:lang');
  assert.equal(languages.choices.length, 10);
  const [done] = await say(phone, 'தமிழ்', 'lang:ta-IN');
  assert.match(done.text, /தமிழில்/);
});

test('tracking by number, and order updates arrive on WhatsApp', async () => {
  const phone = '9822233377';
  const [none] = await say(phone, 'track my order');
  assert.match(none.text, /could not find an order/);
  const owner = server.actor();
  await loginCustomer(owner, phone, 'Lata Pawar');
  const quote = await owner.post('/quotes', { profile: { business: 'retail', employees: 3, tier: '1', gstin: 'no' } });
  await owner.post(`/quotes/${quote.body.quote.id}/save`);
  const order = (await owner.post('/orders', { quoteId: quote.body.quote.id })).body.order;
  const thread = (await sim.get(`/whatsapp/sim/thread?phone=${phone}`)).body.messages;
  assert.ok(thread.some(message => message.kind === 'notification' && message.text.includes(order.ref)), 'order notification mirrored to WhatsApp');
  const [status] = await say(phone, 'Track my order', 'menu:track');
  assert.match(status.text, new RegExp(order.ref));
  assert.match(status.text, /Waiting for verification/);
});

test('"talk to a person" routes a callback to the local partner, once', async () => {
  const phone = '9822233388';
  await say(phone, 'clinic in Chennai with 8 staff');
  const [done] = await say(phone, 'Talk to a person', 'menu:human');
  assert.match(done.text, /local partner/);
  const [again] = await say(phone, 'call me');
  assert.match(again.text, /already/);
  const partner = server.actor();
  await loginDemo(partner, 'lakshmi.partner@udyam.demo');
  const item = (await partner.get('/partner/cases')).body.cases.find(row => row.title.includes('WhatsApp'));
  assert.ok(item, 'Chennai partner gets the WhatsApp callback');
  assert.match(item.reason, /professional, 8 people/);
  assert.equal((await partner.get(`/partner/cases/${item.id}`)).body.case.contact.phone, phone);
});

test('Meta webhook: verification handshake and inbound messages', async () => {
  const anon = server.actor();
  assert.equal((await anon.get('/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=42')).status, 403);
  const payload = { object: 'whatsapp_business_account', entry: [{ changes: [{ value: { contacts: [{ wa_id: '919822233399', profile: { name: 'Meena' } }], messages: [{ from: '919822233399', type: 'text', text: { body: 'Hi' } }] } }] }] };
  assert.deepEqual(parseWebhook(payload), [{ phone: '9822233399', name: 'Meena', text: 'Hi', choice: null }]);
  assert.equal((await anon.post('/whatsapp/webhook', payload)).status, 200);
  await new Promise(resolve => setTimeout(resolve, 300));
  const thread = (await sim.get('/whatsapp/sim/thread?phone=9822233399')).body.messages;
  assert.ok(thread.some(message => message.direction === 'out' && /Accel Business assistant/.test(message.text)));
});

test('outbound messages respect WhatsApp limits', () => {
  const buttons = toCloudPayload('9822233344', { text: 'Pick', choices: [{ id: 'a', label: 'A very long button label here' }, { id: 'b', label: 'B' }] });
  assert.equal(buttons.to, '919822233344');
  assert.equal(buttons.interactive.type, 'button');
  assert.ok(buttons.interactive.action.buttons[0].reply.title.length <= 20);
  const list = toCloudPayload('9822233344', { text: 'Pick', choices: Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, label: `Choice number ${i} with a long label` })) });
  assert.equal(list.interactive.type, 'list');
  assert.equal(list.interactive.action.sections[0].rows.length, 10);
  assert.ok(list.interactive.action.sections[0].rows.every(row => row.title.length <= 24));
});
