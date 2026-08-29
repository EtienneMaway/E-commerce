import type { Metadata } from 'next';
import { Landing } from '../_landing/Landing';
import { content } from '../_landing/content';
import { alternates, SITE_URL } from '../_landing/seo';

/**
 * French landing page.
 *
 * A separate static route rather than a client-side language toggle: the app's
 * market is francophone, so the French copy needs its own indexable URL and its
 * own `hreflang` pairing with `/`. It also means neither page ships JavaScript
 * to switch languages.
 */
export const dynamic = 'force-static';

const t = content.fr;

export const metadata: Metadata = {
  // `absolute` opts out of the root layout's `%s · KMB-Talk` template —
  // this title already names the product.
  title: { absolute: t.meta.title },
  description: t.meta.description,
  alternates: alternates('/fr'),
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/fr`,
    siteName: 'KMB-Talk',
    locale: 'fr',
    title: t.meta.title,
    description: t.meta.description,
  },
};

export default function FrenchHomePage() {
  return <Landing t={t} />;
}
