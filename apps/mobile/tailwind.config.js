/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#2563EB',    // blue-600 — main actions
        danger: '#DC2626',     // red-600 — losses, debts
        success: '#16A34A',    // green-600 — profits, credits
        warning: '#D97706',    // amber-600 — warnings
        // Adaptive tokens — light/dark values defined via CSS vars in global.css
        surface: 'var(--surface)',
        card: 'var(--card)',
        border: 'var(--border)',
        muted: 'var(--muted)',
        text: 'var(--foreground)',
      },
    },
  },
  plugins: [],
};
