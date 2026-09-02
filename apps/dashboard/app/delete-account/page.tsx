import type { Metadata } from 'next';
import Link from 'next/link';
import { alternatesPair } from '../_landing/seo';

/**
 * Public account-deletion instructions.
 *
 * Google Play requires a URL, reachable **without signing in**, that names the
 * app, spells out the steps to request deletion, and says which data is erased,
 * which is kept, and for how long. That is why this lives beside `/privacy`
 * rather than inside `(main)` — a page behind auth would not satisfy it, and a
 * reviewer with no account has to be able to read it.
 *
 * The figures here are not marketing copy: the 7-day window is
 * ACCOUNT_DELETION_GRACE_DAYS in `apps/api/src/common/constants.ts`, and the
 * erased/kept split is exactly what `UsersService.purgeExpiredAccounts` does.
 * If either changes, change this page in the same commit.
 */
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Delete your KMB-Talk account',
  description:
    'How to request deletion of your KMB-Talk account, what data is erased, what is kept, and how long it takes.',
  alternates: alternatesPair('/delete-account', '/fr/delete-account', '/delete-account'),
};

// Same address as the privacy policy and the landing footer — a reviewer who
// compares the three should not find three different contacts.
const SUPPORT_EMAIL = 'support@kmb-talk.com';

export default function DeleteAccountPage() {
  return (
    <main className="policy">
      <article className="policy-body">
        <p className="policy-lang">
          <Link href="/fr/delete-account">Français</Link>
        </p>

        <h1>Delete your KMB-Talk account</h1>

        <p>
          This page explains how to ask for your <strong>KMB-Talk</strong> account and its
          data to be deleted. It applies to the KMB-Talk mobile app and the KMB-Talk web
          dashboard, which share one account.
        </p>

        <h2>Delete your account from the app</h2>
        <p>The fastest way is from inside the app, and it takes effect immediately.</p>

        <h3>On the phone app</h3>
        <ol>
          <li>Open KMB-Talk and sign in.</li>
          <li>Tap the profile icon (👤) at the top right of the Home screen.</li>
          <li>On the Account screen, tap <strong>Delete account</strong>.</li>
          <li>Type <strong>DELETE</strong> in the box, enter your password, and confirm.</li>
        </ol>

        <h3>On the web dashboard</h3>
        <ol>
          <li>Sign in and open <strong>Settings</strong>.</li>
          <li>Scroll to <strong>Delete account</strong> at the bottom of the page.</li>
          <li>Type <strong>DELETE</strong> in the box, enter your password, and confirm.</li>
        </ol>

        <h2>If you cannot sign in</h2>
        <p>
          Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from the address
          registered on the account, with the subject <strong>Delete my account</strong>.
          Include the username or phone number on the account so it can be identified.
          Requests are actioned within 30 days.
        </p>

        <h2>What happens, and when</h2>
        <p>
          Your account is closed <strong>straight away</strong> and you are signed out. It
          then enters a <strong>7-day grace period</strong>, so a deletion made by mistake
          can be undone: sign in again within those 7 days and you will be offered the
          option to restore the account. Nothing is permanently erased before the 7 days
          are up.
        </p>

        <h2>What is deleted</h2>
        <p>After the 7-day grace period, the following are permanently erased:</p>
        <ul>
          <li>Your name</li>
          <li>Your username</li>
          <li>Your email address</li>
          <li>Your phone number</li>
          <li>Your date of birth</li>
          <li>Your password</li>
        </ul>
        <p>
          You can no longer sign in, and you are no longer findable by other users of the
          app.
        </p>

        <h2>What is kept, and why</h2>
        <p>
          Trading records that <strong>another person is also part of</strong> are kept on
          that person&apos;s books, with your identity replaced by an anonymous marker.
          This covers sales, debts and credits, payments, stock movements and
          consignments.
        </p>
        <p>
          The reason is that these records are not only yours. If a supplier gave you goods
          on credit, deleting your account cannot erase their record of what they were
          owed — that would destroy another trader&apos;s own accounts. What is removed is
          the link between those records and you: they remain as entries against an
          anonymous former user.
        </p>
        <p>
          These anonymised records carry no name, username, email, phone number or date of
          birth, and are kept for as long as the counterparty&apos;s own account exists.
        </p>

        <h2>Questions</h2>
        <p>
          Write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. See also our{' '}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </article>
    </main>
  );
}
