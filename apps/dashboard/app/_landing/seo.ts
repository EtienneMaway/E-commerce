import type { Metadata } from 'next';

/**
 * The canonical origin. Nginx serves the dashboard on the `www` host (see
 * `VPS_DEPLOYMENT.md`), so that is what canonical and `hreflang` URLs must
 * point at — pointing them at the apex would ask Google to index a host that
 * redirects.
 *
 * Overridable so a staging deploy does not advertise production URLs.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://www.kmb-talk.com';

/**
 * Canonical + `hreflang` alternates for a landing route.
 *
 * `x-default` points at the English page, which is what a crawler should serve
 * when it cannot match either language.
 */
export function alternates(path: '/' | '/fr'): Metadata['alternates'] {
  return {
    canonical: path,
    languages: {
      en: '/',
      fr: '/fr',
      'x-default': '/',
    },
  };
}
