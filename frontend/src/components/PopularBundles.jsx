import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { api } from '../api/client.js';
import { useLanguage } from '../i18n/index.jsx';
import { getAdvisorCopy } from '../lib/advisorLocales.js';
import { rupees } from '../lib/format.js';

// "Popular with businesses like yours": real bundles bought by each segment, priced from the catalogue.
export default function PopularBundles() {
  const { language } = useLanguage();
  const copy = getAdvisorCopy(language);
  const navigate = useNavigate();
  const [bundles, setBundles] = useState([]);
  useEffect(() => { api.get('/catalogue/popular').then(({ data }) => setBundles(data.bundles)).catch(() => {}); }, []);
  const step = key => copy.flow.find(item => item.key === key);
  const label = (key, value) => step(key)?.choices.find(([choice]) => String(choice) === String(value))?.[1] || value;
  if (!bundles.length) return null;
  return (
    <section>
      <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><h2 className="text-2xl font-semibold">{copy.ui.popular}</h2><p className="max-w-lg text-sm text-ink-muted">{copy.ui.popularHint}</p></div>
      <ul className="divide-y divide-line border-y border-line">
        {bundles.map(card => (
          <li key={card.business}>
            <button onClick={() => navigate('/advisor', { state: { preset: card } })} className="group grid w-full gap-x-8 gap-y-2 py-5 text-left sm:grid-cols-[13rem_1fr_auto] sm:items-baseline">
              <div>
                <p className="font-medium">{label('business', card.business)}</p>
                <p className="text-sm text-ink-muted">{label('employees', card.example.employees)} · {label('sites', card.example.sites)}</p>
              </div>
              <div className="text-sm">
                <p className="text-ink-soft">{card.items.map(item => `${item.name}${item.quantity > 1 ? ` × ${item.quantity}` : ''}`).join(', ')}</p>
                <p className="mt-1 text-ink-muted">{card.customers} {copy.ui.chosenBy}{card.often_added ? ` · ${copy.ui.oftenAdded}: ${card.often_added.name}` : ''}</p>
                {card.without_gstin && <p className="mt-1 text-warn-700">{copy.ui.noGst}: {card.without_gstin.items.join(' + ')} · {rupees(card.without_gstin.monthly_incl_gst)}{copy.ui.perMonth}</p>}
                {card.needs_gstin && !card.without_gstin && <p className="mt-1 text-warn-700">{copy.ui.needsGst}</p>}
              </div>
              <div className="flex items-baseline gap-4 sm:justify-end">
                <p className="num whitespace-nowrap"><span className="text-xl font-semibold">{rupees(card.monthly_incl_gst)}</span><span className="text-sm text-ink-muted">{copy.ui.perMonth}</span></p>
                <span className="flex items-center gap-1 whitespace-nowrap text-sm font-medium text-brand-700 group-hover:underline">{copy.ui.tailor}<ArrowRight className="h-4 w-4" /></span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
