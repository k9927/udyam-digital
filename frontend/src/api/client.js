import axios from 'axios';

// Same-origin in development (Vite proxies /api) and in production (Express serves the build).
export const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE || '/api', withCredentials: true });

const QUOTE_TOKENS = 'ud_quote_tokens';
export const quoteToken = id => { try { return JSON.parse(localStorage.getItem(QUOTE_TOKENS) || '{}')[id]; } catch { return undefined; } };
export const rememberQuoteToken = (id, token) => {
  try { const all = JSON.parse(localStorage.getItem(QUOTE_TOKENS) || '{}'); all[id] = token; localStorage.setItem(QUOTE_TOKENS, JSON.stringify(all)); } catch { /* storage unavailable */ }
};

api.interceptors.request.use(config => {
  const match = config.url?.match(/^\/quotes\/([a-f0-9]{24})/);
  if (match) { const token = quoteToken(match[1]); if (token) config.headers['x-quote-token'] = token; }
  return config;
});

export const errorMessage = (error, fallback = 'Something went wrong. Please try again.') => error?.response?.data?.error || (error?.code === 'ERR_NETWORK' ? 'Cannot reach the server. Is the backend running?' : fallback);
