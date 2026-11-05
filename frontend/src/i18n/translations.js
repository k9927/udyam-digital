// Customer-screen translations, keyed by 2-letter language code and loaded on demand. Missing keys fall back to en.js.
export default {
  hi: () => import('./locales/hi.js'),
  mr: () => import('./locales/mr.js'),
  ta: () => import('./locales/ta.js'),
  te: () => import('./locales/te.js'),
  kn: () => import('./locales/kn.js'),
  gu: () => import('./locales/gu.js'),
  bn: () => import('./locales/bn.js'),
  ml: () => import('./locales/ml.js'),
  pa: () => import('./locales/pa.js'),
};
