import { readFileSync } from 'fs';
import { join } from 'path';
import type { Metadata } from 'next';
import { PolicyPage } from '../../privacy/policy-page';
import { alternatesPair } from '../../_landing/seo';

/**
 * French privacy policy. A separate static route rather than a client-side
 * toggle, for the same reason as the French landing page: the market is
 * francophone, so the French text needs its own indexable URL and its own
 * `hreflang` pairing — and neither page ships JavaScript to switch languages.
 *
 * `PRIVACY_POLICY_FR.md` is a translation of `PRIVACY_POLICY.md` and must be
 * updated alongside it; the two are one document in two languages, not two
 * documents.
 */
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description:
    "Comment l'application KMB-Talk collecte, utilise et protège vos informations.",
  alternates: alternatesPair('/privacy', '/fr/privacy', '/fr/privacy'),
};

function loadPolicy(): string {
  // cwd is apps/dashboard during both `next build` and `next start`.
  return readFileSync(join(process.cwd(), '..', '..', 'PRIVACY_POLICY_FR.md'), 'utf8');
}

export default function FrenchPrivacyPage() {
  return <PolicyPage source={loadPolicy()} altHref="/privacy" altLabel="English" />;
}
