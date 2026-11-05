// Activation propensity for the lead desk: a logistic regression trained at startup on the lead profile
// (never on stage or outcome, which would leak the label), validated on a held-out 25%, then combined with
// transparent follow-up rules for drop reason and funnel stage.
const CATEGORICAL = {
  lead_source: 'Source', segment: 'Segment', city_tier: 'City tier', has_gstin: 'GSTIN', has_udyam: 'Udyam',
  current_internet: 'Current internet', current_provider: 'Current provider', annual_turnover_band: 'Turnover',
};
const bucket = (value, edges, labels) => labels[edges.findIndex(edge => value <= edge)] ?? labels.at(-1);
const DERIVED = {
  team: row => bucket(Number(row.employee_count) || 1, [1, 5, 10, 25], ['1 person', '2-5 people', '6-10 people', '11-25 people', '26+ people']),
  sites: row => bucket(Number(row.num_sites) || 1, [1, 3], ['1 site', '2-3 sites', '4+ sites']),
  spend: row => bucket(Number(row.monthly_telecom_spend_inr) || 0, [1999, 4999, 9999], ['spend under ₹2k', 'spend ₹2-5k', 'spend ₹5-10k', 'spend ₹10k+']),
};
const DERIVED_LABEL = { team: 'Team size', sites: 'Locations', spend: 'Monthly spend' };
const FIELD_TEXT = {
  has_gstin: { Y: 'has a GSTIN', N: 'no GSTIN' }, has_udyam: { Y: 'Udyam registered', N: 'no Udyam' },
  city_tier: { 1: 'tier 1 city', 2: 'tier 2 city' },
};

// Follow-up rules (not learned: every open lead dropped, so outcomes cannot rank reasons).
const REASON_FACTOR = {
  'Installation delayed beyond 21 days': [1.4, 'delay was on our side'], 'Quote took too long to arrive': [1.4, 'instant digital quote fixes this'],
  'Quote too complex to understand': [1.4, 'itemised plain-language quote fixes this'], 'Found paperwork too long': [1.4, 'Smart KYC removes paperwork'],
  'Missing GST or Udyam document': [1.3, 'registry lookup can replace documents'], 'Document details did not match': [1.2, 'document checks show what to fix'],
  'Visit not scheduled by sales': [1.3, 'missed by our team'], 'Owner had no time for a visit': [1.2, 'self-serve needs no visit'],
  'Authorised signatory not available': [1.1, 'can sign later digitally'], 'First payment failed': [1.2, 'retry payment'],
  'Price too high': [1.0, 'price objection'], 'Competitor offered cheaper plan': [0.9, 'competitor price'], 'Decided to wait': [0.9, 'timing'],
  'Only wanted a mobile plan': [0.8, 'narrow need'], 'Site not feasible for fibre': [0.8, 'offer 5G AirFiber instead'],
  'Locked in with current provider': [0.6, 'contract lock-in'], 'Customer cancelled before install': [0.7, 'cancelled'],
  'Not interested on first call': [0.5, 'not interested'], 'Unreachable after 3 attempts': [0.4, 'hard to reach'], 'Wrong or invalid number': [0.2, 'invalid number'],
};
const STAGE_FACTOR = { Lead: 0.9, Contacted: 1.0, 'Needs assessed': 1.15, 'Quote accepted': 1.35, 'KYC complete': 1.5 };

function featurize(row) {
  const features = Object.keys(CATEGORICAL).map(key => `${key}=${row[key]}`);
  for (const [key, fn] of Object.entries(DERIVED)) features.push(`${key}=${fn(row)}`);
  return features;
}
function describe(feature) {
  const [key, value] = feature.split('=');
  return FIELD_TEXT[key]?.[value] || (DERIVED[key] ? value : `${CATEGORICAL[key] || DERIVED_LABEL[key]}: ${value}`);
}
const sigmoid = z => 1 / (1 + Math.exp(-z));
const isHoldout = id => [...id].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 1000, 7) % 4 === 0;

function auc(scored) {
  const sorted = [...scored].sort((a, b) => a.p - b.p);
  let rankSum = 0, positives = 0;
  sorted.forEach((item, index) => { if (item.y) { rankSum += index + 1; positives++; } });
  const negatives = sorted.length - positives;
  return (rankSum - positives * (positives + 1) / 2) / (positives * negatives);
}

export function trainPropensity(rows) {
  const data = rows.map(row => ({ id: row.lead_id, x: featurize(row), y: row.outcome === 'Activated' ? 1 : 0 }));
  const train = data.filter(item => !isHoldout(item.id)), test = data.filter(item => isHoldout(item.id));
  const overallRate = data.reduce((sum, item) => sum + item.y, 0) / data.length;
  const vocabulary = [...new Set(train.flatMap(item => item.x))];
  const index = new Map(vocabulary.map((feature, position) => [feature, position]));
  const weights = new Float64Array(vocabulary.length);
  const baseRate = train.reduce((sum, item) => sum + item.y, 0) / train.length;
  let bias = Math.log(baseRate / (1 - baseRate));
  const lambda = 0.002, rate = 0.5;
  for (let epoch = 0; epoch < 400; epoch++) {
    const gradient = new Float64Array(vocabulary.length);
    let biasGradient = 0;
    for (const item of train) {
      let z = bias;
      for (const feature of item.x) z += weights[index.get(feature)];
      const error = sigmoid(z) - item.y;
      biasGradient += error;
      for (const feature of item.x) gradient[index.get(feature)] += error;
    }
    bias -= rate * biasGradient / train.length;
    for (let i = 0; i < weights.length; i++) weights[i] -= rate * (gradient[i] / train.length + lambda * weights[i]);
  }
  const predict = features => {
    let z = bias;
    const contributions = [];
    for (const feature of features) {
      const position = index.get(feature);
      if (position === undefined) continue;
      z += weights[position];
      contributions.push({ feature, weight: weights[position] });
    }
    return { p: sigmoid(z), contributions };
  };
  const scoredTest = test.map(item => ({ p: predict(item.x).p, y: item.y }));
  const testRate = test.reduce((sum, item) => sum + item.y, 0) / test.length;
  const topDecile = [...scoredTest].sort((a, b) => b.p - a.p).slice(0, Math.max(1, Math.round(test.length / 10)));
  const topRate = topDecile.reduce((sum, item) => sum + item.y, 0) / topDecile.length;
  const metrics = { trained_on: train.length, holdout: test.length, holdout_auc: Number(auc(scoredTest).toFixed(3)), base_rate: Number((testRate * 100).toFixed(1)), top_decile_rate: Number((topRate * 100).toFixed(1)), top_decile_lift: Number((topRate / testRate).toFixed(1)) };
  const strongest = vocabulary.map((feature, position) => ({ feature: describe(feature), weight: Number(weights[position].toFixed(2)) })).sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, 8);

  function score(row) {
    const { p, contributions } = predict(featurize(row));
    const [reasonFactor, reasonNote] = REASON_FACTOR[row.drop_reason] || [1, 'no recorded reason'];
    const stageFactor = STAGE_FACTOR[row.stage_reached] ?? 1;
    const priority = p * reasonFactor * stageFactor;
    const ranked = [...contributions].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).filter(item => Math.abs(item.weight) >= 0.15).slice(0, 3);
    const reasons = [
      `Model: ${(p * 100).toFixed(1)}% activation likelihood (average ${(overallRate * 100).toFixed(1)}%)`,
      ...ranked.map(item => `${item.weight > 0 ? '▲' : '▼'} ${describe(item.feature)}`),
      `Stage ${row.stage_reached} ×${stageFactor}`,
      ...(row.drop_reason ? [`${row.drop_reason}: ${reasonNote} ×${reasonFactor}`] : []),
    ];
    return { probability: p, priority, reasons };
  }
  return { score, metrics, strongest };
}
