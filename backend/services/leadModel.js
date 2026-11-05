import { Lead } from '../models/index.js';
import { trainPropensity } from '../libs/propensity.js';
import { popularBundles } from '../libs/popularBundles.js';

let model = null, popular = null;

// Trained once per process on the historical leads (profile fields only; see libs/propensity.js).
export async function getLeadModel() {
  if (!model) model = trainPropensity(await Lead.find().lean());
  return model;
}

export async function getPopularBundles(catalogue) {
  if (!popular) popular = popularBundles(await Lead.find({ outcome: 'Activated' }).lean(), catalogue);
  return popular;
}

export const resetLeadCaches = () => { model = null; popular = null; };
