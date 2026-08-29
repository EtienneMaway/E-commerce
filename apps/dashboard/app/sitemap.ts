import type { MetadataRoute } from 'next';
import { SITE_URL } from './_landing/seo';

/**
 * Only the pages a crawler should actually index: the two landing routes and
 * the privacy policy. Everything under `(main)` is behind auth, and `/login`
 * and `/register` are transactional — listing them invites Google to index
 * forms instead of the page that explains the product.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'monthly', priority: 1 },
    { url: `${SITE_URL}/fr`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
