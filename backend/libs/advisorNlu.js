// Rule-based understanding of an owner's free text in English, Hinglish and 9 Indian languages.
// Every field mentioned anywhere in a message is captured, so corrections ("actually 3 branches") simply override.
import { readCsv } from './csv.js';

const BUSINESS = [
  ['multi', /\bchain\b|multiple (shops|stores|outlets|restaurants)|multi.?site|franchise/i],
  ['manufacturing', /manufactur|factory|workshop|textile|auto.?part|fabrication|plant|unit\b|packaging|कारखाना|फैक्ट्री|उत्पादन|தொழிற்சாலை|తయారీ|ಕಾರ್ಖಾನೆ|ઉત્પાદન|કારખાનું|কারখানা|ഉൽപ്പാദന|ਫੈਕਟਰੀ|ਵਰਕਸ਼ਾਪ/i],
  ['professional', /clinic|doctor|dental|dentist|hospital|diagnostic|lab\b|physio|\bca\b|chartered|accountant|lawyer|legal|advocate|consult|coaching|tuition|institute|school|office|agency|architect|insurance|क्लिनिक|डॉक्टर|दवाखाना|कार्यालय|ऑफिस|कोचिंग|வக்கீல்|கிளினிக்|క్లినిక్|ಕ್ಲಿನಿಕ್|ક્લિનિક|ক্লিনিক|ക്ലിനിക്ക്|ਕਲੀਨਿਕ|হিসাবরক্ষক|ആശുപത്രി/i],
  ['retail', /kirana|grocery|retail|shop|store|salon|parlou?r|pharmacy|chemist|medical store|bakery|boutique|restaurant|cafe|dhaba|hotel|sweet|mobile shop|dukaan|dukan|दुकान|किराना|स्टोर|सैलून|கடை|దుకాణం|ಅಂಗಡಿ|দোকান|കട|ਦੁਕਾਨ|દુકાન/i],
];
const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, fifty: 50, ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, saat: 7, aath: 8, das: 10, 'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'पाँच': 5, 'छह': 6, 'सात': 7, 'आठ': 8, 'दस': 10 };
const NUM = `(\\d{1,4}|${Object.keys(NUMBER_WORDS).join('|')})`;
const toNumber = token => (/^\d+$/.test(token) ? Number(token) : NUMBER_WORDS[token.toLowerCase()] ?? NaN);
const PEOPLE_WORDS = 'people|persons?|staff|employees?|workers?|members|teachers?|doctors?|dentists?|nurses?|advocates?|lawyers?|accountants?|associates?|agents?|engineers?|chefs?|cooks?|waiters?|drivers?|technicians?|operators?|labou?rers?|stylists?|assistants?|salespeople|consultants?|log|लोग|कर्मचारी|पेर्|பேர்|மக்கள்|మంది|ಜನ|લોક|লোক|জন|പേർ|ਲੋਕ|ਬੰਦੇ';
const SITE_WORDS = 'locations?|sites?|branch(?:es)?|outlets?|stores?|shops?|offices?|places|units|centres?|centers?|jagah|स्थान|जगह|शाखा|ब्रांच|இடங்கள்|இட|ప్రదేశాల|ಸ್ಥಳ|સ્થળ|জায়গা|സ്ഥല|ਥਾਵਾਂ';

export const bucketEmployees = n => (n <= 1 ? 1 : n <= 5 ? 3 : n <= 10 ? 8 : n <= 25 ? 15 : 30);
export const bucketSites = n => (n <= 1 ? 1 : n === 2 ? 2 : n === 3 ? 3 : n <= 5 ? 5 : 8);

const PRODUCT_REQUESTS = [
  ['P23', /cctv|camera|surveillance|कैमरा|सीसीटीवी|கேமரா|కెమెరా|ಕ್ಯಾಮೆರಾ|કેમેરા|ক্যামেরা|ക്യാമറ|ਕੈਮਰਾ/i],
  ['P19', /\bpos\b|billing machine|billing software|cloud pos|point of sale|card machine|बिलिंग मशीन/i],
  ['P18', /website|web ?site|domain|वेबसाइट|வலைத்தளம்|వెబ్‌సైట్|ವೆಬ್‌ಸೈಟ್|વેબસાઇટ|ওয়েবসাইট|വെബ്സൈറ്റ്|ਵੈੱਬਸਾਈਟ/i],
  ['P15', /whatsapp (business|api|channel)|whatsapp for (my )?business/i],
  ['P14', /\bsms\b|bulk message|text alerts/i],
  ['P13', /toll.?free|1800/i],
  ['P16', /business email|email id|office suite|google workspace|ईमेल/i],
  ['P17', /backup of (data|files|pc)|cloud backup|data backup/i],
  ['P20', /antivirus|anti-virus|virus|ransomware|endpoint/i],
  ['P21', /firewall/i],
  ['P22', /guest wi-?fi|customer wi-?fi|wi-?fi for customers|free wifi/i],
  ['P11', /static ip|fixed ip/i],
  ['P05', /leased line|dedicated line|dedicated internet/i],
  ['P10', /sd-?wan/i],
  ['P09', /failover|backup internet|backup connection|internet goes down|internet down/i],
  ['P25', /fleet|gps track|vehicle track|delivery vans?|trucks?/i],
  ['P24', /machine monitor|iot|sensor|machine uptime/i],
  ['P12', /cloud telephony|\bivr\b|call centre|call center|sip/i],
  ['P03', /1 ?gbps|gigabit|1000 ?mbps/i],
];
// Monetary amounts: "₹2,000", "rs 2000", "2k", "2000 rupees".
const AMOUNT = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(k)?|([\d,]+(?:\.\d+)?)\s*(k)?\s*(?:rupees|rs\b|₹|\/-|per month|a month|monthly)/gi;
const parseAmount = (digits, k) => Math.round(Number(String(digits).replace(/,/g, '')) * (k ? 1000 : 1));

let cityTiers;
function cityTierIndex() {
  if (!cityTiers) {
    cityTiers = new Map();
    for (const row of readCsv('smb_leads.csv')) cityTiers.set(row.city.toLowerCase(), row.city_tier);
    for (const metro of ['mumbai', 'delhi', 'new delhi', 'bengaluru', 'bangalore', 'chennai', 'kolkata', 'hyderabad', 'pune', 'ahmedabad', 'gurugram', 'gurgaon', 'noida']) if (!cityTiers.has(metro)) cityTiers.set(metro, '1');
  }
  return cityTiers;
}

export function understand(text) {
  const value = String(text || '').toLowerCase();
  const updates = {}, found = new Set(), wants = [];
  let budget = null, city = null;

  if (/\b(just|only) me\b|\bmyself\b|\bsolo\b|alone|sirf main|अकेला|अकेली|केवल मैं/i.test(value)) updates.employees = 1;
  const people = value.match(new RegExp(`${NUM}\\s*(?:-|\\s)?\\s*(?:${PEOPLE_WORDS})`, 'i')) || value.match(new RegExp(`(?:team of|staff of|we are|हम)\\s*${NUM}`, 'i'));
  if (people && Number.isFinite(toNumber(people[1]))) updates.employees = bucketEmployees(toNumber(people[1]));
  if (/single (location|shop|store|outlet|site|branch)|one (location|shop|store|outlet|site)|ek (hi )?(dukaan|dukan|jagah)/i.test(value)) updates.sites = 1;
  const sites = value.match(new RegExp(`${NUM}\\s*(?:${SITE_WORDS})`, 'i'));
  if (sites && Number.isFinite(toNumber(sites[1])) && !(people && people.index === sites.index)) updates.sites = bucketSites(toNumber(sites[1]));

  for (const [type, regex] of BUSINESS) if (regex.test(value)) { updates.business = type; break; }
  if (updates.business === 'multi' && !updates.sites) updates.sites = 2;
  if ((updates.sites ?? 0) >= 2 && /restaurant|cafe|store|shop|outlet|bakery|salon|pharmacy/i.test(value) && !/clinic|office|factory|workshop/i.test(value)) updates.business = 'multi';

  if (/no gst|not gst|without gst|gst nahi|gst nahin|not registered|unregistered|no registration|gst नहीं|जीएसटी नहीं|gst.{0,12}(नाही|नहीं|இல்லை|లేదు|ಇಲ್ಲ|નથી|নেই|ഇല്ല|ਨਹੀਂ)|don'?t have (a )?gst/i.test(value)) updates.gstin = 'no';
  else if (/gstin|\bgst\b|जीएसटी|ஜிஎஸ்டி|ಜಿಎಸ್ಟಿ|జిఎస్టి|જીએસટી|জিএসটি|ജിഎസ്ടി|ਜੀਐਸਟੀ/i.test(value)) updates.gstin = 'yes';

  if (/leased|dedicated line|several (isp|provider)|multiple (isp|provider)|different (isp|provider)|लीज़्ड|लीज्ड/i.test(value)) updates.current = 'leased';
  else if (/hotspot|mobile data|phone internet|jio ?fi|dongle|हॉटस्पॉट|ஹாட்ஸ்பாட்|హాట్‌స్పాట్|ಹಾಟ್‌ಸ್ಪಾಟ್|હોટસ્પોટ|হটস্পট|ഹോട്ട്സ്പോട്ട്|ਹੌਟਸਪੌਟ/i.test(value)) updates.current = 'hotspot';
  else if (/home (broadband|wi-?fi|internet|connection)|घर का|घरचे|வீட்டு|ఇంటి|ಮನೆಯ|ઘરનું|বাড়ির|വീട്ടിലെ|ਘਰ ਦਾ/i.test(value)) updates.current = 'home';
  else if (/business broadband|office broadband|बिज़नेस ब्रॉडबैंड|बिझनेस ब्रॉडबँड/i.test(value)) updates.current = 'business';
  else if (/no internet|nothing yet|don'?t have internet|without internet|इंटरनेट नहीं/i.test(value)) updates.current = 'none';
  // A business owner saying just "broadband" or "wi-fi" almost always means a fixed plan at the premises.
  else if (/\b(broadband|wi-?fi|fibre|fiber)\b|ब्रॉडबैंड|ब्रॉडबँड/i.test(value) && !/\b(want|need|looking for|get)\b[^.]*\b(broadband|fibre|fiber)\b/i.test(value)) updates.current = 'business';

  if (/secur|protect|antivirus|ransomware|virus|hack|cctv|camera|theft|सुरक्षा|பாதுகாப்ப|భద్రత|ಭದ್ರತೆ|સુરક્ષા|নিরাপত্তা|സുരക്ഷ|ਸੁਰੱਖਿਆ/i.test(value)) updates.goal = 'security';
  else if (/customer|marketing|whatsapp|reach|online presence|website|ग्राहक|வாடிக்கையாளர்|కస్టమర్|ಗ್ರಾಹಕ|ગ્રાહક|গ্রাহক|ഉപഭോക്താ|ਗਾਹਕ/i.test(value)) updates.goal = 'customers';
  else if (/bill|pos\b|operations|inventory|stock|machine|production|बिलिंग|ಬಿಲ್ಲಿಂಗ್|బిల్లింగ్|બિલિંગ|বিলিং|ബില്ലിംഗ|ਬਿਲਿੰਗ/i.test(value)) updates.goal = 'operations';
  else if (/(manage|connect|control).{0,15}(locations|branches|outlets|sites)|across (branches|locations)/i.test(value)) updates.goal = 'locations';
  else if (/reliable|internet|connect|speed|slow|drop|outage|keeps going down|इंटरनेट|இணையம்|ఇంటర్నెట్|ಇಂಟರ್ನೆಟ್|ઇન્ટરનેટ|ইন্টারনেট|ഇന്റർനെറ്റ്|ਇੰਟਰਨੈੱਟ/i.test(value)) updates.goal = 'reliable';

  for (const match of value.matchAll(AMOUNT)) {
    const amount = parseAmount(match[1] ?? match[3], match[2] ?? match[4]);
    if (!Number.isFinite(amount) || amount < 100) continue;
    const before = value.slice(Math.max(0, match.index - 30), match.index);
    if (/budget|under|within|below|max|upto|up to|less than|not more than|afford|tak|सीमा|बजट/i.test(before)) budget = amount;
    else updates.spend = String(amount);
  }
  if (budget === null) {
    const plain = value.match(/(?:budget|under|within|below|upto|up to|not more than)\s*(?:of\s*)?([\d,]{3,7})(k)?/i);
    if (plain) budget = parseAmount(plain[1], plain[2]);
  }

  if (/tier\s*(1|one|i)\b|\bmetro\b/i.test(value)) updates.tier = '1';
  else if (/tier\s*(2|two|ii)\b|non.?metro|small (town|city)/i.test(value)) updates.tier = '2';
  else {
    for (const [name, tier] of cityTierIndex()) if (new RegExp(`\\b${name}\\b`, 'i').test(value)) { updates.tier = tier; city = name; break; }
  }

  for (const [id, regex] of PRODUCT_REQUESTS) if (regex.test(value)) wants.push(id);
  for (const key of Object.keys(updates)) found.add(key);
  const recognized = found.size > 0 || wants.length > 0 || budget !== null || /^(skip|no|none|nahi|नहीं)$/i.test(value.trim());
  if (/^(skip|no thanks|nahi)$/i.test(value.trim())) found.add('spend');
  return { updates, found: [...found], wants, budget, city, recognized };
}
