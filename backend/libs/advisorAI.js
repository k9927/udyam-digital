import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { redactIdentifiers } from './redact.js';

// Optional GenAI advisor. It runs only when Anthropic credentials are configured and ADVISOR_AI is not "off";
// otherwise the browser keeps using its local multilingual rules.
const LANGUAGE_NAMES = { 'en-IN': 'English', 'hi-IN': 'Hindi', 'mr-IN': 'Marathi', 'ta-IN': 'Tamil', 'te-IN': 'Telugu', 'kn-IN': 'Kannada', 'gu-IN': 'Gujarati', 'bn-IN': 'Bengali', 'ml-IN': 'Malayalam', 'pa-IN': 'Punjabi' };

const AdvisorTurn = z.object({
  reply: z.string().describe('What the advisor says next, in the customer\'s language. At most 3 short sentences.'),
  profile_updates: z.object({
    business: z.enum(['retail', 'professional', 'multi', 'manufacturing']).nullable(),
    employees: z.union([z.literal(1), z.literal(3), z.literal(8), z.literal(15), z.literal(30)]).nullable(),
    sites: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(5), z.literal(8)]).nullable(),
    tier: z.enum(['1', '2']).nullable(),
    gstin: z.enum(['yes', 'no']).nullable(),
    current: z.enum(['hotspot', 'home', 'business', 'leased', 'none']).nullable(),
    goal: z.enum(['reliable', 'customers', 'security', 'operations', 'locations']).nullable(),
    spend: z.number().int().min(0).max(1000000).nullable(),
  }).describe('Only fields the customer has stated or clearly implied in this conversation; null for anything not yet known.'),
  wants: z.array(z.enum(['P01','P02','P03','P04','P05','P06','P07','P08','P09','P10','P11','P12','P13','P14','P15','P16','P17','P18','P19','P20','P21','P22','P23','P24','P25'])).describe('Catalogue product IDs the customer explicitly asked for in this conversation; empty if none.'),
  budget: z.number().int().min(0).max(1000000).nullable().describe('Monthly budget in rupees the customer stated as a limit, or null.'),
  ready: z.boolean().describe('True once business type, team size, locations, city tier, GST status, current internet and main goal are all known.'),
});

function systemPrompt(catalogue) {
  const products = catalogue.map(p => `${p.product_id} ${p.product_name} (${p.category}): ${p.description}. From ₹${p.price_min_inr_per_month}/${p.unit.replace('per ', '')} per month; min ${p.min_employees} staff, ${p.min_sites} site(s); ${p.requires_gstin === 'Y' ? 'needs an active GSTIN' : 'no GSTIN needed'}.`).join('\n');
  return `You are the Accel Business onboarding advisor for Indian small businesses (kirana stores, clinics, CA firms, restaurants, small factories). You chat on the web or WhatsApp in the customer's preferred language, in a warm, plain-spoken way with no jargon or product codes.

Your job is needs discovery. Learn, one short question at a time and only what is still unknown: business type, number of people, number of locations, whether the main location is in a tier 1 (metro) or tier 2 city, whether they have an active GST registration, what they use for internet today (mobile hotspot, home broadband, business broadband, leased line or several providers, or nothing), what matters most (reliable internet, reaching customers, security, billing/operations, managing several locations), and optionally their current monthly telecom spend. Several facts often arrive in one message; capture all of them.

Map answers onto the profile fields:
- business: retail = shop, kirana, salon, pharmacy, bakery; professional = clinic, CA/legal/insurance office, coaching centre; multi = restaurant chain or any business with branches; manufacturing = workshop, factory, textile or auto-parts unit.
- employees bucket: 1 (just the owner), 3 (2-5), 8 (6-10), 15 (11-25), 30 (26+).
- sites bucket: 1, 2, 3, 5 (4-5), 8 (6+).
- current: hotspot, home, business, leased (leased line or several providers) or none.
- spend: rupees per month as a number.

If the customer asks for a specific product (for example CCTV, a website or a POS), put its product ID in wants; if they state a monthly limit, set budget. The pricing engine checks eligibility and will explain if a product cannot be added.

When the profile is complete, set ready to true and tell them to press "Build my recommendation" to see an itemised quote. The app, not you, chooses products and computes prices from the catalogue below, so do not quote totals or promise a bundle. You may explain in general terms what kinds of products fit their needs. If they ask about products that need a GSTIN, explain that these unlock after their GST registration is verified with consent in the KYC step; saying "yes" here is not enough.

Never ask for GSTIN, Udyam, Aadhaar, PAN, phone numbers or other identifiers in chat; those are collected later, with consent, in the verification step. If a customer shares one anyway, do not repeat it back.

Catalogue for reference:
${products}`;
}

let client;
export function advisorAvailable() {
  const mode = String(process.env.ADVISOR_AI || 'auto').toLowerCase();
  if (mode === 'off') return false;
  return mode === 'on' || Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
}

export class AdvisorUnavailable extends Error {}

export async function advisorTurn({ catalogue, language, messages, profile }) {
  client ||= new Anthropic();
  const languageName = LANGUAGE_NAMES[language] || 'English';
  // Identifiers an owner types by mistake (GSTIN, PAN, Aadhaar, phone…) never leave for the AI provider.
  const conversation = messages.map(message => ({ role: message.from === 'user' ? 'user' : 'assistant', content: redactIdentifiers(message.text).text }));
  while (conversation.length && conversation[0].role !== 'user') conversation.shift();
  conversation.push({ role: 'system', content: `Reply in ${languageName}. Profile captured so far (from chips and the form): ${JSON.stringify(profile)}.` });
  try {
    const response = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(AdvisorTurn) },
      cache_control: { type: 'ephemeral' },
      system: systemPrompt(catalogue),
      messages: conversation,
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) throw new AdvisorUnavailable('The advisor could not answer that. Please use the quick replies.');
    return response.parsed_output;
  } catch (error) {
    if (error instanceof AdvisorUnavailable) throw error;
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) throw new AdvisorUnavailable('GenAI advisor is not configured on this server.');
    if (error instanceof Anthropic.RateLimitError) throw new AdvisorUnavailable('The GenAI advisor is busy. Local guidance is used for now.');
    if (error instanceof Anthropic.APIError) throw new AdvisorUnavailable('The GenAI advisor is unreachable. Local guidance is used for now.');
    // Missing or unresolvable credentials surface as a plain Error before any request is sent.
    console.error('Advisor unavailable:', error.message);
    throw new AdvisorUnavailable('GenAI advisor is not configured on this server.');
  }
}
