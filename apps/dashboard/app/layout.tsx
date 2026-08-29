import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { SITE_URL } from './_landing/seo';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

/**
 * `metadataBase` is what lets the landing pages declare `canonical: '/'` and
 * relative `hreflang` alternates and still emit absolute URLs, which is the
 * only form Google accepts for those tags.
 *
 * The title is a template so the public pages name the product (a crawler
 * showed "KMB — Dashboard" for the whole site before) while app screens can
 * still set their own.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'KMB-Talk — stock, sales and credit in one book',
    template: '%s · KMB-Talk',
  },
  description:
    'A stock and credit book for traders who buy on credit, sell on credit, and settle in francs and dollars.',
  applicationName: 'KMB-Talk',
  formatDetection: { telephone: false },
};

/**
 * Applies the stored theme before first paint.
 *
 * `theme.store.init()` runs in an effect, i.e. after hydration, so a merchant
 * who chose dark used to get a white flash on every cold load — most visible on
 * the landing page, which is the first thing anyone sees. This is the standard
 * blocking-script fix: same `ta_theme` key and same fallback as the store, so
 * the two can never disagree. Keep them in step if either changes.
 */
const THEME_INIT = `try{var t=localStorage.getItem('ta_theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.classList.toggle('dark',t==='dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
