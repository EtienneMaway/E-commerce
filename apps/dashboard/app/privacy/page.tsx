import { readFileSync } from 'fs';
import { join } from 'path';
import type { Metadata } from 'next';
import { Markdown } from './markdown';

/**
 * Public privacy policy — deliberately outside the `(main)` route group, so it
 * carries no auth layout and no sidebar. Google Play requires the policy to be
 * reachable at a public URL without signing in.
 *
 * Content is read from the repo-root `PRIVACY_POLICY.md` at build time, keeping
 * one source of truth for a document that also ships with the repo.
 */
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Privacy Policy — KMB-Talk',
  description:
    'How the KMB-Talk app collects, uses, and protects your information.',
};

function loadPolicy(): string {
  // cwd is apps/dashboard during both `next build` and `next start`.
  return readFileSync(join(process.cwd(), '..', '..', 'PRIVACY_POLICY.md'), 'utf8');
}

export default function PrivacyPage() {
  const source = loadPolicy();

  // No footer: the policy's own Section 11 already ends with the contact email,
  // and repeating it immediately below reads as a rendering glitch.
  return (
    <main className="policy">
      <article className="policy-body">
        <Markdown source={source} />
      </article>
    </main>
  );
}
