import { Fragment } from 'react';
import Link from 'next/link';
import { Fraunces, JetBrains_Mono } from 'next/font/google';
import { KmbLogo } from '../../components/ui/KmbLogo';
import styles from './landing.module.css';
import type { LandingContent } from './content';
import { ThemeToggle } from './ThemeToggle';

/**
 * The public landing page, rendered for `/` (English) and `/fr` (French).
 *
 * A Server Component with no `'use client'` in it apart from the theme switch,
 * so the page ships almost no JavaScript — every link is a real `<a>`, every
 * motion is CSS (load-in keyframes, scroll-driven reveals, an infinite ticker),
 * and the language switch is a navigation rather than a state toggle. This is
 * the first thing a merchant on a 2G link loads, and the first thing Googlebot
 * sees.
 *
 * Look: a *market ledger*. Warm paper and ink, malachite green and copper —
 * the two colours of Katanga's ground — a serif with character for the voice,
 * monospace for every figure. Deliberately not the gradient-hero-plus-cards
 * template.
 *
 * Both display fonts load here, not in the root layout, so the dashboard never
 * pays for them. next/font self-hosts them on our own origin with immutable
 * cache headers: one fetch, then they come from the browser cache.
 */
const display = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['SOFT', 'opsz'],
  variable: '--font-display',
  display: 'swap',
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

/**
 * Runs before the page paints, and does two things for a reader who already has
 * a session.
 *
 * 1. Sends them to the dashboard. Once you have an account this page is not
 *    your home any more — the books are. `?site=1` opts out, which is what the
 *    "Visit website" link in the dashboard passes; that choice is remembered for
 *    the tab so moving between `/` and `/fr` does not bounce them.
 * 2. Marks the document so CSS can swap sign-in / create-account for a single
 *    "Go to dashboard", with no flash of the wrong buttons.
 *
 * The token lives in localStorage, so none of this can happen on the server —
 * which is also why a crawler (no token) always gets the full page.
 */
const SESSION_INIT = `try{var d=document.documentElement;if(localStorage.getItem('auth_token')){d.classList.add('kmb-session');var s=new URLSearchParams(location.search).has('site');if(s){sessionStorage.setItem('kmb_site','1')}else if(!sessionStorage.getItem('kmb_site')){location.replace('/dashboard')}}}catch(e){}`;

function Arrow() {
  return (
    <svg className={styles.arrow} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10h11M11 5.5 15.5 10 11 14.5" />
    </svg>
  );
}

/** One connector in the flow diagram: goods travel right, money owed travels back. */
function Lane({ goods, money }: { goods: string; money: string }) {
  return (
    <div className={styles.lane} aria-hidden="true">
      <span className={styles.laneCap}>{goods}</span>
      <svg viewBox="0 0 120 12" preserveAspectRatio="none" className={styles.laneSvg}>
        <path className={`${styles.laneLine} ${styles.laneGoods}`} d="M2 6 H112" />
        <path className={styles.laneHeadGoods} d="M106 1.5 L114 6 L106 10.5" />
      </svg>
      <svg viewBox="0 0 120 12" preserveAspectRatio="none" className={styles.laneSvg}>
        <path className={`${styles.laneLine} ${styles.laneMoney}`} d="M118 6 H8" />
        <path className={styles.laneHeadMoney} d="M14 1.5 L6 6 L14 10.5" />
      </svg>
      <span className={`${styles.laneCap} ${styles.laneCapMoney}`}>{money}</span>
    </div>
  );
}

/** Small animated drawings for the "works where you work" strip. */
function FieldIcon({ i }: { i: number }) {
  const common = { viewBox: '0 0 48 48', fill: 'none', 'aria-hidden': true, className: styles.fieldIcon } as const;
  if (i === 0) {
    // Signal drops and comes back: bars fade out and refill.
    return (
      <svg {...common}>
        {[0, 1, 2, 3].map((b) => (
          <rect key={b} className={styles.sigBar} style={{ ['--b' as string]: b }} x={8 + b * 9} y={34 - b * 7} width="6" height={8 + b * 7} rx="2" />
        ))}
      </svg>
    );
  }
  if (i === 1) {
    // Slow link: a bar that keeps filling, never blocking.
    return (
      <svg {...common}>
        <rect x="6" y="20" width="36" height="8" rx="4" className={styles.trackBg} />
        <rect x="6" y="20" width="36" height="8" rx="4" className={styles.trackFill} />
      </svg>
    );
  }
  if (i === 2) {
    // A receipt feeding out of a printer.
    return (
      <svg {...common}>
        <g className={styles.receiptFeed}>
          <path d="M15 14h18v26l-3-2-3 2-3-2-3 2-3-2-3 2z" className={styles.paperFill} />
          <path d="M19 21h10M19 26h7M19 31h9" className={styles.inkStroke} />
        </g>
        <rect x="9" y="8" width="30" height="9" rx="3" className={styles.deviceFill} />
      </svg>
    );
  }
  // Phone and web: one book, two screens, a pulse between them.
  return (
    <svg {...common}>
      <rect x="4" y="12" width="26" height="20" rx="3" className={styles.deviceStroke} />
      <rect x="32" y="16" width="12" height="22" rx="3" className={styles.deviceStroke} />
      <circle cx="31" cy="24" r="2.4" className={styles.syncDot} />
    </svg>
  );
}

export function Landing({ t }: { t: LandingContent }) {
  const year = new Date().getFullYear();
  const isFr = t.htmlLang === 'fr';
  const home = isFr ? '/fr' : '/';

  return (
    <div className={`${styles.page} ${display.variable} ${mono.variable}`} lang={t.htmlLang}>
      <script dangerouslySetInnerHTML={{ __html: SESSION_INIT }} />
      <div className={styles.grain} aria-hidden="true" />

      <header className={styles.header}>
        <div className={`${styles.wrap} ${styles.headerInner}`}>
          <Link href={home} className={styles.brand}>
            <KmbLogo size={30} />
            <span className={styles.brandName}>KMB-Talk</span>
          </Link>
          <nav className={styles.headerActions}>
            <ThemeToggle label={t.nav.theme} />
            {/* A link, not a toggle: each language is its own crawlable URL. */}
            <Link href={t.nav.otherLangHref} className={styles.langLink} hrefLang={isFr ? 'en' : 'fr'}>
              {t.nav.otherLangLabel}
            </Link>
            <Link href="/login" className={`${styles.btn} ${styles.btnSm} ${styles.btnGhost} ${styles.guestOnly} ${styles.hideXs}`}>
              {t.nav.signIn}
            </Link>
            <Link href="/register" className={`${styles.btn} ${styles.btnSm} ${styles.btnInk} ${styles.guestOnly}`}>
              {t.nav.register}
            </Link>
            <Link href="/dashboard" className={`${styles.btn} ${styles.btnSm} ${styles.btnInk} ${styles.sessionOnly}`}>
              {t.nav.dashboard}
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className={styles.hero}>
          <div className={styles.heroBg} aria-hidden="true">
            <span className={`${styles.blob} ${styles.blobA}`} />
            <span className={`${styles.blob} ${styles.blobB}`} />
          </div>

          <div className={`${styles.wrap} ${styles.heroGrid}`}>
            <div className={styles.heroCopy}>
              <span className={`${styles.eyebrow} ${styles.enter}`}>
                <span className={styles.liveDot} />
                {t.hero.eyebrow}
              </span>
              <h1 className={styles.h1}>
                <span className={styles.lineMask}>
                  <span className={`${styles.line} ${styles.l1}`}>{t.hero.title[0]}</span>
                </span>
                <span className={styles.lineMask}>
                  <span className={`${styles.line} ${styles.l2} ${styles.h1Accent}`}>
                    {t.hero.title[1]}
                    <svg className={styles.swash} viewBox="0 0 300 18" preserveAspectRatio="none" aria-hidden="true">
                      <path d="M3 13 C 60 4, 140 3, 297 9" />
                    </svg>
                  </span>
                </span>
              </h1>
              <p className={`${styles.lead} ${styles.enter} ${styles.d2}`}>{t.hero.lead}</p>
              <div className={`${styles.ctas} ${styles.enter} ${styles.d3}`}>
                <Link href="/register" className={`${styles.btn} ${styles.btnPrimary} ${styles.guestOnly}`}>
                  {t.hero.ctaPrimary}
                  <Arrow />
                </Link>
                <Link href="/login" className={`${styles.btn} ${styles.btnGhost} ${styles.guestOnly}`}>
                  {t.hero.ctaSecondary}
                </Link>
                <Link href="/dashboard" className={`${styles.btn} ${styles.btnPrimary} ${styles.sessionOnly}`}>
                  {t.nav.dashboard}
                  <Arrow />
                </Link>
              </div>
              <ul className={`${styles.notes} ${styles.enter} ${styles.d4}`}>
                {t.hero.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>

            {/* A day's slip from the book, not a product screenshot: francs in
                the till, the two rates, the two sides of the credit book. The
                figures are illustrative and captioned as such. */}
            <div className={styles.slipStage}>
              <span className={styles.rateChip} aria-hidden="true">
                <span className={styles.rateLabel}>FC / $</span> 2 850
              </span>
              <aside className={styles.slip} aria-label={t.extract.caption}>
                <div className={styles.slipHead}>
                  <span>KMB-Talk</span>
                  <span className={styles.slipNo}>Nº 0417</span>
                </div>
                <dl className={styles.slipRows}>
                  {t.extract.rows.map((r, i) => (
                    <div
                      key={r.label}
                      style={{ ['--i' as string]: i }}
                      className={`${styles.slipRow} ${r.accent ? styles[`x_${r.accent}`] : ''}`}
                    >
                      <dt>{r.label}</dt>
                      <span className={styles.leader} aria-hidden="true" />
                      <dd>{r.value}</dd>
                    </div>
                  ))}
                </dl>
                <p className={styles.slipCaption}>{t.extract.caption}</p>
                <span className={styles.stamp} aria-hidden="true">{t.extract.stamp}</span>
              </aside>
            </div>
          </div>
        </section>

        {/* ── Ticker: the day's movements, scrolling past ── */}
        <div className={styles.ticker} aria-hidden="true">
          <div className={styles.tickerTrack}>
            {[0, 1].map((copy) => (
              <Fragment key={copy}>
                {t.ticker.map((e) => (
                  <span key={`${copy}-${e.item}`} className={styles.tick}>
                    <b>{e.item}</b>
                    <i>{e.move}</i>
                    <span className={e.value.startsWith('−') ? styles.tickOut : styles.tickIn}>{e.value}</span>
                  </span>
                ))}
              </Fragment>
            ))}
          </div>
        </div>

        {/* ── 01 · the credit web ── */}
        <section className={styles.section}>
          <div className={`${styles.wrap} ${styles.split}`}>
            <div className={`${styles.sectionHead} ${styles.sticky}`}>
              <span className={styles.index}>{t.flow.index}</span>
              <p className={styles.kicker}>{t.flow.kicker}</p>
              <h2 className={styles.h2}>{t.flow.title}</h2>
              <p className={styles.sectionLead}>{t.flow.lead}</p>
            </div>

            <div>
              <div className={`${styles.flow} ${styles.reveal}`}>
                {t.flow.nodes.map((node, i) => (
                  <Fragment key={node.label}>
                    <div className={`${styles.node} ${i === 1 ? styles.nodeSelf : ''}`}>
                      <span className={styles.nodeDisc}>{node.label.slice(0, 1)}</span>
                      <p className={styles.nodeLabel}>{node.label}</p>
                      <span className={styles.nodeRole}>{node.role}</span>
                      <p className={styles.nodeNote}>{node.note}</p>
                    </div>
                    {i < t.flow.nodes.length - 1 && <Lane goods={t.flow.goods} money={t.flow.money} />}
                  </Fragment>
                ))}
              </div>

              <ol className={styles.entries}>
                {t.flow.points.map((p, i) => (
                  <li key={p.term} className={`${styles.entry} ${styles.reveal}`}>
                    <span className={styles.entryNo}>{String(i + 1).padStart(2, '0')}</span>
                    <div>
                      <h3 className={styles.entryTerm}>{p.term}</h3>
                      <p className={styles.entryDef}>{p.def}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ── 02 · the rules built in ── */}
        <section className={`${styles.section} ${styles.sectionInk}`}>
          <div className={styles.wrap}>
            <div className={`${styles.sectionHead} ${styles.reveal}`}>
              <span className={styles.index}>{t.ledger.index}</span>
              <p className={styles.kicker}>{t.ledger.kicker}</p>
              <h2 className={`${styles.h2} ${styles.h2Big}`}>{t.ledger.title}</h2>
              <p className={styles.sectionLead}>{t.ledger.lead}</p>
            </div>
            <div className={styles.rules}>
              {t.ledger.items.map((it, i) => (
                <article key={it.term} className={`${styles.rule} ${styles.reveal}`}>
                  <span className={styles.ruleNo}>{String(i + 1).padStart(2, '0')}</span>
                  <h3 className={styles.ruleTerm}>{it.term}</h3>
                  <p className={styles.ruleDef}>{it.def}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── 03 · field conditions ── */}
        <section className={styles.section}>
          <div className={styles.wrap}>
            <div className={`${styles.sectionHead} ${styles.reveal}`}>
              <span className={styles.index}>{t.field.index}</span>
              <p className={styles.kicker}>{t.field.kicker}</p>
              <h2 className={styles.h2}>{t.field.title}</h2>
            </div>
            <div className={styles.field}>
              {t.field.items.map((it, i) => (
                <article key={it.term} className={`${styles.fieldItem} ${styles.reveal}`}>
                  <FieldIcon i={i} />
                  <h3 className={styles.fieldTerm}>{it.term}</h3>
                  <p className={styles.fieldDef}>{it.def}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Close ── */}
        <section className={styles.wrap}>
          <div className={`${styles.close} ${styles.reveal}`}>
            <svg className={styles.badge} viewBox="0 0 200 200" aria-hidden="true">
              <defs>
                <path id="kmbBadgeCircle" d="M100 100 m-78 0 a78 78 0 1 1 156 0 a78 78 0 1 1 -156 0" />
              </defs>
              <text>
                <textPath href="#kmbBadgeCircle" textLength="488" lengthAdjust="spacing">
                  {t.close.badge}
                </textPath>
              </text>
              <circle cx="100" cy="100" r="46" className={styles.badgeCore} />
              <path d="M84 100l11 11 22-24" className={styles.badgeTick} />
            </svg>
            <h2 className={styles.closeTitle}>{t.close.title}</h2>
            <p className={styles.closeLead}>{t.close.lead}</p>
            <div className={styles.ctas}>
              <Link href="/register" className={`${styles.btn} ${styles.btnOnDark} ${styles.guestOnly}`}>
                {t.close.cta}
                <Arrow />
              </Link>
              <Link href="/login" className={`${styles.btn} ${styles.btnOnDarkGhost} ${styles.guestOnly}`}>
                {t.close.secondary}
              </Link>
              <Link href="/dashboard" className={`${styles.btn} ${styles.btnOnDark} ${styles.sessionOnly}`}>
                {t.nav.dashboard}
                <Arrow />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={`${styles.wrap} ${styles.footerInner}`}>
          <div>
            <Link href={home} className={styles.brand}>
              <KmbLogo size={24} />
              <span className={styles.brandName}>KMB-Talk</span>
            </Link>
            <p className={styles.footerTag}>{t.footer.tagline}</p>
          </div>
          <div className={styles.footerLinks}>
            <Link href={isFr ? '/fr/privacy' : '/privacy'}>{t.footer.privacy}</Link>
            <a href="mailto:support@kmb-talk.com">{t.footer.contact}</a>
            <Link href={t.nav.otherLangHref} hrefLang={isFr ? 'en' : 'fr'}>
              {t.nav.otherLangLabel}
            </Link>
          </div>
          <p className={styles.copyright}>© {year} KMB-Talk. {t.footer.rights}</p>
        </div>
      </footer>
    </div>
  );
}
