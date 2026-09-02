import Link from 'next/link';
import { Markdown } from './markdown';

/**
 * Shared body for the two privacy-policy routes, `/privacy` and `/fr/privacy`.
 *
 * It takes the Markdown as a string rather than a filename on purpose: each
 * route reads its own file with a literal path, so the bundler can resolve it
 * statically. Passing the path through here instead made the read a dynamic
 * expression, and Turbopack responded by tracing every file under the repo
 * root as a possible match.
 */
export function PolicyPage({
  source,
  altHref,
  altLabel,
}: {
  source: string;
  altHref: string;
  altLabel: string;
}) {
  return (
    <main className="policy">
      <article className="policy-body">
        <p className="policy-lang">
          <Link href={altHref}>{altLabel}</Link>
        </p>
        <Markdown source={source} />
      </article>
    </main>
  );
}
