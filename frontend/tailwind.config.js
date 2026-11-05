/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#fff2f2', 100: '#ffe1e1', 200: '#ffc7c7', 300: '#ff9b9b', 400: '#f25c5c', 500: '#e32630', 600: '#d40000', 700: '#ad0009', 800: '#8f0a10', 900: '#760f14' },
        ink: { DEFAULT: '#18191a', soft: '#34363a', muted: '#5c5f66', faint: '#8b8e95' },
        paper: '#f4f4f2',
        line: '#e2e2de',
        ok: { 50: '#eaf5ee', 600: '#23794c', 700: '#1b5e3b' },
        warn: { 50: '#fdf4e3', 600: '#a8690f', 700: '#80500b' },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', '"IBM Plex Sans Devanagari"', 'system-ui', 'Arial', 'sans-serif'],
        display: ['"IBM Plex Sans"', '"IBM Plex Sans Devanagari"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      // Headings are set at 600; 800 read as shouting in Plex.
      fontWeight: { extrabold: '600' },
      boxShadow: { card: 'none', pop: '0 8px 24px rgba(20,20,22,.12)' },
    },
  },
  plugins: [],
};
