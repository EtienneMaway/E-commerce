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

/**
 * Canonical + `hreflang` alternates for any page that exists in both languages.
 *
 * The landing routes use `alternates` above; this covers the public documents
 * (`/privacy`, `/delete-account`) whose French twins live under `/fr/…`. Same
 * rule for `x-default`: the English URL, since that is what a crawler should
 * fall back to when it matches neither language.
 */
export function alternatesPair(en: string, fr: string, current: string): Metadata['alternates'] {
  return {
    canonical: current,
    languages: { en, fr, 'x-default': en },
  };
}
