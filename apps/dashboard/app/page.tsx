import type { Metadata } from 'next';
import { Landing } from './_landing/Landing';
import { content } from './_landing/content';
import { alternates, SITE_URL } from './_landing/seo';

/**
 * The public entry point.
 *
 * This used to `redirect('/dashboard')`, which meant the domain's root was a
 * bounce into an authenticated app: a first-time visitor landed on a login
 * wall, and a crawler following `https://kmb-talk.com` never found a page to
 * index. `/privacy` was the only public URL on the site. Now the root is a real
 * page and the app lives one click away.
 *
 * Statically rendered — nothing here depends on the request.
 */
export const dynamic = 'force-static';

const t = content.en;

export const metadata: Metadata = {
  // `absolute` opts out of the root layout's `%s · KMB-Talk` template —
  // this title already names the product.
  title: { absolute: t.meta.title },
  description: t.meta.description,
  alternates: alternates('/'),
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/`,
    siteName: 'KMB-Talk',
    locale: 'en',
    title: t.meta.title,
    description: t.meta.description,
  },
};

export default function HomePage() {
  return <Landing t={t} />;
}
