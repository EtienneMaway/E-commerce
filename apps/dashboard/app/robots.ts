import type { MetadataRoute } from 'next';
import { SITE_URL } from './_landing/seo';

/**
 * Keep crawlers out of the authenticated app. Those routes redirect to /login
 * without a session, so crawling them yields nothing but duplicate login pages
 * competing with the landing page for the site's ranking.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/dashboard', '/inventory', '/suppliers', '/debtors', '/sales',
        '/consignments', '/external-contacts', '/expenses', '/withdrawals',
        '/employees', '/pricing', '/activity', '/settings', '/my-salary',
        '/no-access', '/login', '/register',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
