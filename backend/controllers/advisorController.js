import { z } from 'zod';
import { understand } from '../libs/advisorNlu.js';
import { advisorAvailable, advisorTurn, AdvisorUnavailable } from '../libs/advisorAI.js';
import { normaliseProfile } from '../libs/pricing.js';
import { getCatalogue } from '../services/reference.js';

const KEYS = ['business', 'employees', 'sites', 'tier', 'gstin', 'current', 'goal', 'spend'];
let aiEnabled = null;

export function status(req, res) {
  aiEnabled ??= advisorAvailable();
  res.json({ ai: aiEnabled });
}

const bodySchema = z.object({
  text: z.string().trim().min(1).max(600),
  language: z.string().max(8).default('en-IN'),
  profile: z.record(z.any()).default({}),
  answered: z.array(z.string()).default([]),
  history: z.array(z.object({ from: z.enum(['user', 'assistant']), text: z.string().max(600) })).max(20).default([]),
});

// One advisor turn. With Claude configured the model reads free text in any language; otherwise (or on any
// failure) the local rules do. Either way the result is a set of profile updates the pricing engine validates.
export async function message(req, res) {
  const body = bodySchema.parse(req.body);
  aiEnabled ??= advisorAvailable();
  if (aiEnabled) {
    try {
      const turn = await advisorTurn({ catalogue: await getCatalogue(), language: body.language, messages: [...body.history, { from: 'user', text: body.text }], profile: normaliseProfile(body.profile) });
      const updates = Object.fromEntries(Object.entries(turn.profile_updates || {}).filter(([, value]) => value !== null).map(([key, value]) => [key, key === 'spend' ? String(value) : value]));
      return res.json({ mode: 'ai', reply: turn.reply, updates, found: Object.keys(updates), wants: turn.wants || [], budget: turn.budget ?? null, recognized: true, ready: turn.ready });
    } catch (error) {
      if (!(error instanceof AdvisorUnavailable)) throw error;
      if (/not configured/.test(error.message)) aiEnabled = false;
      const local = understand(body.text);
      return res.json({ mode: 'rules', notice: error.message, ...local, ready: KEYS.slice(0, 7).every(key => body.answered.includes(key) || local.found.includes(key)) });
    }
  }
  const local = understand(body.text);
  res.json({ mode: 'rules', ...local, ready: KEYS.slice(0, 7).every(key => body.answered.includes(key) || local.found.includes(key)) });
}
