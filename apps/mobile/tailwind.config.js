/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      // Every colour resolves to a CSS var declared in `global.css`, which
      // mirrors the dashboard's `app/globals.css`. That means the token flips
      // itself between light and dark — `bg-card` is correct in both themes and
      // must NOT be paired with a `dark:` override.
      //
      // The `rgb(var(--x) / <alpha-value>)` form is load-bearing, not styling
      // noise: it is what keeps the alpha modifiers (`bg-primary/10`,
      // `border-primary/30`) working. Written as a plain `var(--x)` holding a
      // hex, Tailwind cannot inject the alpha and drops every `/N` utility
      // from the stylesheet with no error — the element just renders
      // background-less. Keep the vars in `global.css` as RGB channels.
      //
      // Literal hexes live only in `lib/theme.ts` (BRAND / useBrand), for the
      // React Native props that cannot take a className. Keep the two in sync.
      colors: {
        // Brand
        primary: 'rgb(var(--primary) / <alpha-value>)',
        'primary-dark': 'rgb(var(--primary-dark) / <alpha-value>)',
        'primary-light': 'rgb(var(--primary-light) / <alpha-value>)',
        'brand-violet': 'rgb(var(--brand-violet) / <alpha-value>)',

        // Semantic
        danger: 'rgb(var(--danger) / <alpha-value>)',
        'danger-light': 'rgb(var(--danger-light) / <alpha-value>)',
        success: 'rgb(var(--success) / <alpha-value>)',
        'success-light': 'rgb(var(--success-light) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        'warning-light': 'rgb(var(--warning-light) / <alpha-value>)',

        // Surfaces
        background: 'rgb(var(--background) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        'border-subtle': 'rgb(var(--border-subtle) / <alpha-value>)',

        // Text
        text: 'rgb(var(--foreground) / <alpha-value>)',
        'text-secondary': 'rgb(var(--foreground-secondary) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        'muted-subtle': 'rgb(var(--muted-subtle) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};
