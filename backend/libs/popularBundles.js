// "Popular with businesses like yours": the products each segment's activated customers chose most,
// priced from the catalogue for a stated example size so owners see a real monthly price before any questions.
const SEGMENTS = [
  { segment: 'Micro retail & services', business: 'retail', employees: 3, sites: 1 },
  { segment: 'Professional offices', business: 'professional', employees: 8, sites: 1 },
  { segment: 'Small multi-site businesses', business: 'multi', employees: 15, sites: 3 },
  { segment: 'Small manufacturers', business: 'manufacturing', employees: 30, sites: 1 },
];
// Without a verified GSTIN the brief's retail pattern is 5G AirFiber + website (P04 + P18).
const WITHOUT_GSTIN = { retail: ['P04', 'P18'] };
const CORE_SHARE = 0.45, ADDON_SHARE = 0.25, MAX_PRODUCTS = 4;
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

export function popularBundles(leads, catalogue) {
  const byId = new Map(catalogue.map(product => [product.product_id, product]));
  const activated = leads.filter(row => row.outcome === 'Activated' && row.bundle_products);
  return SEGMENTS.map(({ segment, business, employees, sites }) => {
    const customers = activated.filter(row => row.segment === segment);
    const counts = new Map(), quantities = new Map();
    for (const row of customers) for (const item of row.bundle_products.split(';')) {
      const [id, quantity] = item.split('x');
      counts.set(id, (counts.get(id) || 0) + 1);
      quantities.set(id, [...(quantities.get(id) || []), Number(quantity) || 1]);
    }
    const fits = product => Number(product.min_employees) <= employees && Number(product.min_sites) <= sites;
    const ranked = [...counts].map(([id, count]) => ({ id, share: count / customers.length })).filter(item => byId.has(item.id) && fits(byId.get(item.id))).sort((a, b) => b.share - a.share);
    let core = ranked.filter(item => item.share >= CORE_SHARE).slice(0, MAX_PRODUCTS);
    const isConnectivity = item => ['P01', 'P02', 'P03', 'P04', 'P05', 'P06'].includes(item.id);
    if (!core.some(isConnectivity)) {
      const connectivity = ranked.find(isConnectivity);
      if (connectivity) core = [...core.slice(0, MAX_PRODUCTS - 1), connectivity];
    }
    const chosen = new Set(core.map(item => item.id));
    core = core.filter(item => {
      const needs = byId.get(item.id).requires_one_of.split('|').filter(Boolean);
      return !needs.length || needs.some(need => chosen.has(need));
    });
    const quantityFor = id => {
      const unit = byId.get(id).unit;
      if (['per site', 'per camera', 'per counter'].includes(unit)) return sites;
      if (['per user', 'per device'].includes(unit)) return employees;
      if (unit === 'per line') return Math.min(employees, median(quantities.get(id)));
      return 1;
    };
    const items = core.map(({ id, share }) => {
      const product = byId.get(id), quantity = quantityFor(id);
      return { product_id: id, name: product.product_name, quantity, unit: product.unit.replace('per ', ''), monthly: Number(product.price_min_inr_per_month) * quantity, share: Math.round(share * 100), requires_gstin: product.requires_gstin === 'Y' };
    });
    const monthly = items.reduce((sum, item) => sum + item.monthly, 0);
    const setup = core.reduce((sum, { id }) => sum + Number(byId.get(id).one_time_setup_inr) * quantityFor(id), 0);
    const addon = ranked.find(item => !chosen.has(item.id) && item.share >= ADDON_SHARE && item.share < CORE_SHARE);
    return {
      segment, business, example: { employees, sites }, customers: customers.length, items,
      monthly, monthly_incl_gst: Math.round(monthly * 1.18), setup,
      contract_months: Math.max(...core.map(({ id }) => Number(byId.get(id).min_contract_months))),
      needs_gstin: items.some(item => item.requires_gstin),
      without_gstin: WITHOUT_GSTIN[business] ? { items: WITHOUT_GSTIN[business].map(id => byId.get(id).product_name), monthly_incl_gst: Math.round(WITHOUT_GSTIN[business].reduce((sum, id) => sum + Number(byId.get(id).price_min_inr_per_month), 0) * 1.18) } : null,
      often_added: addon ? { product_id: addon.id, name: byId.get(addon.id).product_name, share: Math.round(addon.share * 100) } : null,
    };
  });
}
