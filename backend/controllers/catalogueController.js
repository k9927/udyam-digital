import { getCatalogue } from '../services/reference.js';
import { getPopularBundles } from '../services/leadModel.js';

export async function listProducts(req, res) {
  res.json({ products: await getCatalogue() });
}

export async function popular(req, res) {
  res.json({ bundles: await getPopularBundles(await getCatalogue()) });
}
