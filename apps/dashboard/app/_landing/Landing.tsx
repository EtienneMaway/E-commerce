import { Fragment } from 'react';
import Link from 'next/link';
import { KmbLogo } from '../../components/ui/KmbLogo';
import styles from './landing.module.css';
import type { LandingContent } from './content';
import { HeroScene } from './HeroScene';
import { ThemeToggle } from './ThemeToggle';

/**
 * The public landing page, rendered for `/` (English) and `/fr` (French).
 *
 * A Server Component with no `'use client'` anywhere in it, so the page itself
 * ships zero JavaScript — every link is a real `<a>`, the reveals are CSS
 * scroll-driven animations, and the language switch is a navigation rather than
 * a state toggle. That matters more here than anywhere else in the product:
 * this is the first thing a merchant on a 2G link loads, and the first thing
 * Googlebot sees.
 */

/** One connector in the flow diagram: goods out, money owed back. */
function Link2({ goods, money }: { goods: string; money: string }) {
  return (
    <div className={styles.link} aria-hidden="true">
      <span className={styles.laneCap}>{goods}</span>
      <svg className={styles.lane} viewBox="0 0 100 15" preserveAspectRatio="none">
        <path className={`${styles.laneLine} ${styles.laneGoods}`} d="M2 7.5 H90" />
        <path className={`${styles.laneHead} ${styles.laneGoods}`} d="M85 3.5 L92 7.5 L85 11.5" strokeDasharray="none" />
      </svg>
      <svg className={styles.lane} viewBox="0 0 100 15" preserveAspectRatio="none">
        <path className={`${styles.laneLine} ${styles.laneMoney}`} d="M98 7.5 H10" />
        <path className={`${styles.laneHead} ${styles.laneMoney}`} d="M15 3.5 L8 7.5 L15 11.5" strokeDasharray="none" />
      </svg>
      <span className={styles.laneCap}>{money}</span>
    </div>
  );
}

/**
 * Runs before the page paints, and does two things for a reader who already has
 * a session.
 *
 * 1. Sends them to the dashboard. Once you have an account this page is not
 *    your home any more — the books are. `?site=1` opts out, which is what the
 *    "Visit website" link in the dashboard's user menu passes; that choice is
 *    remembered for the tab so moving between `/` and `/fr` does not bounce
 *    them, and the dashboard clears it again on arrival.
 * 2. Marks the document so CSS can swap sign-in / create-account for a single
 *    "Go to dashboard". Doing it with a class rather than a client component
 *    means no flash of the wrong buttons and no extra JavaScript.
 *
 * The token lives in localStorage, so none of this can happen on the server.
 * That is also why it is safe for search engines: a crawler has no token, never
 * matches, and gets the full marketing page.
 */
const SESSION_INIT = `try{var d=document.documentElement;if(localStorage.getItem('auth_token')){d.classList.add('kmb-session');var s=new URLSearchParams(location.search).has('site');if(s){sessionStorage.setItem('kmb_site','1')}else if(!sessionStorage.getItem('kmb_site')){location.replace('/dashboard')}}}catch(e){}`;

export function Landing({ t }: { t: LandingContent }) {
  const year = new Date().getFullYear();

  return (
    <div className={styles.page} lang={t.htmlLang}>
      <script dangerouslySetInnerHTML={{ __html: SESSION_INIT }} />
      <header className={styles.header}>
        <div className={`${styles.wrap} ${styles.headerInner}`}>
          <Link href={t.htmlLang === 'fr' ? '/fr' : '/'} className={styles.brand}>
            <KmbLogo size={30} />
            <span className={styles.brandName}>KMB-Talk</span>
          </Link>
          <nav className={styles.headerActions}>
            <ThemeToggle label={t.nav.theme} />
            {/* A link, not a toggle: each language is its own crawlable URL. */}
            <Link href={t.nav.otherLangHref} className={styles.langLink} hrefLang={t.htmlLang === 'fr' ? 'en' : 'fr'}>
              {t.nav.otherLangLabel}
            </Link>
            <Link href="/login" className={`${styles.btn} ${styles.btnSm} ${styles.btnQuiet} ${styles.guestOnly}`}>
              {t.nav.signIn}
            </Link>
            <Link href="/register" className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary} ${styles.guestOnly}`}>
              {t.nav.register}
            </Link>
            <Link href="/dashboard" className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary} ${styles.sessionOnly}`}>
              {t.nav.dashboard}
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className={styles.hero}>
          <HeroScene />
          <div className={`${styles.wrap} ${styles.heroGrid}`}>
            <div>
            <span className={`${styles.eyebrow} ${styles.enter}`}>{t.hero.eyebrow}</span>
            <h1 className={`${styles.h1} ${styles.enter} ${styles.d1}`}>
              <span className={styles.h1Accent}>{t.hero.title[0]}</span>
              <br />
              {t.hero.title[1]}
            </h1>
            <p className={`${styles.lead} ${styles.enter} ${styles.d2}`}>{t.hero.lead}</p>
            <div className={`${styles.heroCtas} ${styles.enter} ${styles.d3}`}>
              <Link href="/register" className={`${styles.btn} ${styles.btnPrimary} ${styles.guestOnly}`}>
                {t.hero.ctaPrimary}
              </Link>
              <Link href="/login" className={`${styles.btn} ${styles.btnQuiet} ${styles.guestOnly}`}>
                {t.hero.ctaSecondary}
              </Link>
              <Link href="/dashboard" className={`${styles.btn} ${styles.btnPrimary} ${styles.sessionOnly}`}>
                {t.nav.dashboard}
              </Link>
            </div>
            <ul className={`${styles.notes} ${styles.enter} ${styles.d4}`}>
              {t.hero.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            </div>

            {/* A ledger extract, not a product screenshot: it shows the shape of
                the position the app keeps — francs in the till, the two rates,
                and the two sides of the credit book. Figures are illustrative
                and captioned as such. */}
            <aside className={`${styles.extract} ${styles.enter} ${styles.d3}`} aria-label={t.extract.caption}>
              <dl className={styles.extractRows}>
                {t.extract.rows.map((r) => (
                  <div
                    key={r.label}
                    className={`${styles.extractRow} ${r.accent ? styles[`x_${r.accent}`] : ''}`}
                  >
                    <dt>{r.label}</dt>
                    <dd>{r.value}</dd>
                  </div>
                ))}
              </dl>
              <p className={styles.extractCaption}>{t.extract.caption}</p>
            </aside>
          </div>
        </section>

        {/* ── 01 · the credit web ── */}
        <section className={styles.section}>
          <div className={styles.wrap}>
            <div className={`${styles.sectionHead} ${styles.reveal}`}>
              <div className={styles.headRow}>
                <span className={styles.index}>{t.flow.index}</span>
                <p className={styles.kicker}>{t.flow.kicker}</p>
              </div>
              <h2 className={styles.h2}>{t.flow.title}</h2>
              <p className={styles.sectionLead}>{t.flow.lead}</p>
            </div>

            <div className={`${styles.flow} ${styles.reveal}`}>
              {t.flow.nodes.map((node, i) => (
                <Fragment key={node.label}>
                  <div className={`${styles.node} ${i === 1 ? styles.nodeSelf : ''}`}>
                    <span className={styles.nodeRole}>{node.role}</span>
                    <p className={styles.nodeLabel}>{node.label}</p>
                    <p className={styles.nodeNote}>{node.note}</p>
                  </div>
                  {i < t.flow.nodes.length - 1 && (
                    <Link2 goods={t.flow.goods} money={t.flow.money} />
                  )}
                </Fragment>
              ))}
            </div>

            <dl className={styles.points}>
              {t.flow.points.map((p) => (
                <div key={p.term} className={`${styles.point} ${styles.reveal}`}>
                  <dt className={styles.pointTerm}>{p.term}</dt>
                  <dd className={styles.pointDef}>{p.def}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ── 02 · the rules built in ── */}
        <section className={`${styles.section} ${styles.sectionAlt}`}>
          <div className={styles.wrap}>
            <div className={`${styles.sectionHead} ${styles.reveal}`}>
              <div className={styles.headRow}>
                <span className={styles.index}>{t.ledger.index}</span>
                <p className={styles.kicker}>{t.ledger.kicker}</p>
              </div>
              <h2 className={styles.h2}>{t.ledger.title}</h2>
              <p className={styles.sectionLead}>{t.ledger.lead}</p>
            </div>
            <div className={styles.grid}>
              {t.ledger.items.map((it) => (
                <article key={it.term} className={`${styles.cell} ${styles.reveal}`}>
                  <h3 className={styles.cellTerm}>{it.term}</h3>
                  <p className={styles.cellDef}>{it.def}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── 03 · field conditions ── */}
        <section className={styles.section}>
          <div className={styles.wrap}>
            <div className={`${styles.sectionHead} ${styles.reveal}`}>
              <div className={styles.headRow}>
                <span className={styles.index}>{t.field.index}</span>
                <p className={styles.kicker}>{t.field.kicker}</p>
              </div>
              <h2 className={styles.h2}>{t.field.title}</h2>
            </div>
            <div className={`${styles.grid} ${styles.gridTight}`}>
              {t.field.items.map((it) => (
                <article key={it.term} className={`${styles.cell} ${styles.reveal}`}>
                  <h3 className={styles.cellTerm}>{it.term}</h3>
                  <p className={styles.cellDef}>{it.def}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Close ── */}
        <section className={styles.wrap}>
          <div className={`${styles.close} ${styles.reveal}`}>
            <h2 className={styles.closeTitle}>{t.close.title}</h2>
            <p className={styles.closeLead}>{t.close.lead}</p>
            <div className={styles.closeCtas}>
              <Link href="/register" className={`${styles.btn} ${styles.btnOnBrand} ${styles.guestOnly}`}>
                {t.close.cta}
              </Link>
              <Link href="/login" className={`${styles.btn} ${styles.btnOnBrandQuiet} ${styles.guestOnly}`}>
                {t.close.secondary}
              </Link>
              <Link href="/dashboard" className={`${styles.btn} ${styles.btnOnBrand} ${styles.sessionOnly}`}>
                {t.nav.dashboard}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={`${styles.wrap} ${styles.footerInner}`}>
          <div>
            <Link href={t.htmlLang === 'fr' ? '/fr' : '/'} className={styles.brand}>
              <KmbLogo size={24} />
              <span className={styles.brandName}>KMB-Talk</span>
            </Link>
            <p className={styles.footerTag}>{t.footer.tagline}</p>
          </div>
          <div className={styles.footerLinks}>
            {/* The policy now exists in both languages, so the French page must not
                send its reader to the English one. */}
            <Link href={t.htmlLang === 'fr' ? '/fr/privacy' : '/privacy'}>{t.footer.privacy}</Link>
            <a href="mailto:support@kmb-talk.com">{t.footer.contact}</a>
            <Link href={t.nav.otherLangHref} hrefLang={t.htmlLang === 'fr' ? 'en' : 'fr'}>
              {t.nav.otherLangLabel}
            </Link>
          </div>
          <p className={styles.copyright}>© {year} KMB-Talk. {t.footer.rights}</p>
        </div>
      </footer>
    </div>
  );
}
