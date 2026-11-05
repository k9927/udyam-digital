// Catalogue-driven bundle selection and plain-language product reasons, shared by the UI and tests.
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const productWhy = {
  P01: () => 'Fibre at 100 Mbps comfortably runs UPI payments, billing and video calls, with no setup fee.',
  P02: (q, p) => `300 Mbps keeps ${p.employees > 1 ? `a team of ${p.employees}` : 'you and your devices'} online at the same time${q > 1 ? `, at each of your ${q} locations` : ''}.`,
  P03: () => '1 Gbps with priority support for a larger team that cannot afford slowdowns.',
  P04: () => 'Plug-and-play 5G broadband: live in about 2 days, no fibre work and only a 6-month commitment.',
  P05: () => 'A dedicated line with a 99.5% uptime promise, so machines and billing never share bandwidth.',
  P06: () => 'A 100 Mbps dedicated line with a 99.9% uptime promise for round-the-clock operations.',
  P07: q => `${plural(q, 'business mobile line')} with 50 GB data and unlimited calls for you and key staff.`,
  P08: q => `${plural(q, 'premium mobile line')} with roaming and priority care for staff who travel.`,
  P09: () => 'Switches to 4G/5G automatically if the main line drops, so payments and bookings keep working.',
  P10: q => `See and manage the internet at all ${q} locations from one screen, with billing apps prioritised.`,
  P11: () => 'A fixed internet address so CCTV, servers or remote access keep working reliably.',
  P12: () => 'Business phone lines over the internet with IVR and call recording.',
  P13: () => 'A 1800 number customers can call for free, routed to your phones.',
  P14: () => '10,000 SMS a month for order alerts and offers, with DLT registration handled.',
  P15: () => 'A verified WhatsApp channel to share your catalogue and answer customers quickly.',
  P16: q => `Email on your own domain plus shared documents and video meetings for ${plural(q, 'person')}.`,
  P17: () => 'Automatic 1 TB backup of PCs and phones, so client and business files are not lost.',
  P18: () => 'A simple 5-page website with your own domain so customers can find you online.',
  P19: () => 'GST-ready billing, stock tracking and UPI/card acceptance on one tablet.',
  P20: q => `Antivirus and ransomware protection for ${plural(q, 'device')}.`,
  P21: () => 'A managed firewall watched by a security team, blocking attacks before they reach your systems.',
  P22: () => 'Separate guest Wi-Fi for customers while keeping your billing network private.',
  P23: q => `${plural(q, 'HD camera')} with 30-day cloud recording you can watch on your phone.`,
  P24: q => `Sensors on ${plural(q, 'machine')} that alert you to downtime and high power use.`,
  P25: q => `Live GPS tracking for ${plural(q, 'vehicle')}.`,
};
export const explainProduct = (id, quantity, profile) => productWhy[id]?.(quantity, profile) || '';

export function recommend(profile, catalogue, hasActiveGST = false) {
  const gst = hasActiveGST;
  const eligible = product => product && product.available_city_tiers.split(';').includes(profile.tier) && profile.employees >= Number(product.min_employees) && profile.sites >= Number(product.min_sites) && (product.requires_gstin !== 'Y' || gst);
  let ids;
  if (profile.business === 'retail') ids = gst ? ['P01','P07','P19'] : ['P04','P18'];
  if (profile.business === 'professional') ids = ['P02','P11','P16','P20'];
  if (profile.business === 'multi') ids = ['P02','P09','P23','P15'];
  if (profile.business === 'manufacturing') ids = gst ? ['P05','P21','P24'] : ['P02','P16','P20'];
  if (profile.business === 'retail' && profile.goal === 'customers') ids = [gst?'P01':'P04','P07','P18'];
  if (profile.business === 'retail' && profile.goal === 'security') ids = [gst?'P01':'P04','P07','P22'];
  if (profile.business === 'professional' && profile.goal === 'security') ids = ['P02','P11','P17','P20'];
  if (profile.business === 'professional' && profile.goal === 'customers') ids = ['P02','P16','P15'];
  if (profile.business === 'multi' && profile.goal === 'locations') ids = gst ? ['P02','P09','P10','P23','P15'] : ['P02','P09','P23'];
  if (profile.business === 'multi' && profile.goal === 'security') ids = ['P02','P09','P23','P22'];
  if (profile.business === 'manufacturing' && profile.goal === 'operations') ids = gst ? ['P05','P21','P24','P16'] : ['P02','P16','P20'];
  const byId = new Map(catalogue.map(product => [product.product_id, product]));
  let selected = ids.filter(id => eligible(byId.get(id)));
  if (!selected.some(id => ['P01','P02','P03','P04','P05','P06'].includes(id))) {
    const fallback = ['P04','P01','P02','P05','P03','P06'].find(id => eligible(byId.get(id)));
    if (!fallback) return { ids: [], addons: [], quantities: {}, byId };
    selected.unshift(fallback);
  }
  const chosen = new Set(selected);
  selected = [...new Set(selected.filter(id => { const req=(byId.get(id)?.requires_one_of||'').split('|').filter(Boolean);return !req.length||req.some(value=>chosen.has(value)); }))];
  const quantities = {};
  for (const id of selected) {
    const product = byId.get(id);
    quantities[id] = ['per site','per camera'].includes(product.unit) ? profile.sites : product.unit === 'per line' ? Math.max(1,Math.min(profile.employees,3)) : ['per user','per device'].includes(product.unit) ? Math.max(1,Math.min(profile.employees,5)) : 1;
  }
  const desired = profile.business==='retail'?['P04','P15','P18','P22','P23','P14']:profile.business==='professional'?['P09','P15','P17','P18','P21','P22']:profile.business==='multi'?['P04','P10','P12','P14','P21','P22','P25']:['P04','P09','P11','P17','P25'];
  const addons = desired.filter(id => { const p=byId.get(id),req=(p?.requires_one_of||'').split('|').filter(Boolean);return !chosen.has(id)&&eligible(p)&&(!req.length||req.some(value=>chosen.has(value))); });
  for (const id of addons) { const p=byId.get(id);quantities[id]=['per site','per camera'].includes(p.unit)?profile.sites:p.unit==='per device'?Math.max(1,Math.min(profile.employees,5)):1; }
  // Everything an active-GSTIN check would add, including the brief's GST-only retail upgrade (P01 + P07 + P19).
  const locked = gst ? [] : recommend(profile, catalogue, true).ids.filter(id => !selected.includes(id));
  return { ids:selected, addons, quantities, byId, locked };
}

const CURRENT_TOOLS_NOTE = {
  hotspot: 'It replaces the mobile hotspot with a dedicated business connection, so UPI and billing no longer depend on your phone.',
  home: 'It moves you from home broadband to a business plan with business-grade support.',
  business: 'It upgrades your business broadband and brings the services you buy separately today onto one bill.',
  leased: 'It brings your existing links under one bill and one support number.',
  none: 'Everything is new, so installation includes setting up each service.',
};
export const currentToolsNote = current => CURRENT_TOOLS_NOTE[current] || '';
