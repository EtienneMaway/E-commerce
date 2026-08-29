import styles from './landing.module.css';

/**
 * The hero backdrop: the moment the paper book is put down.
 *
 * Left of the group is how the books were kept until now — a shelf of filled
 * ledgers, one open at a page of entries, receipts on a spike, the pen that
 * wrote them. Right is the device, showing the same rows clean. Between them,
 * sheets lift off the open book, arc across, and land as rows that light up one
 * by one. The room is lit by the screen, not a window: the glow that used to
 * sit over the paper has moved.
 *
 * There is no person in it. At desk scale a seated figure dwarfs a phone, and
 * the device is the thing that has to be read — so the desk is the viewer's
 * own, which is also the more direct way to say it.
 *
 * The whole group sits in the right-hand two thirds. The scrim is heaviest on
 * the left to keep the headline legible, and anything staged over there is lost
 * — the composition has to live where the frame is actually clear.
 *
 * Read left to right it is the story the page is making — you were doing this
 * by hand, and now you are not.
 *
 * Why drawn rather than filmed: footage has to be licensed and shot, and a hero
 * video costs 1–3 MB before it plays a frame. These readers are the merchants
 * in `CACHING_AND_PERFORMANCE.md`, on 2G and edge links. This is ~2 KB of
 * markup inside HTML they are already fetching, needs no second request, stays
 * sharp at any density, and animates on the compositor. If licensed footage
 * ever arrives, drop a <video> in beside this and keep the scrim.
 *
 * Colours are CSS custom properties, so the whole scene re-lights for dark mode
 * rather than needing a second copy. Every full-width band overhangs the
 * viewBox by 70px — the room drifts slightly, and a band that stopped at the
 * edge would leave a seam down the side of the hero.
 */

/** One airborne sheet. `delay` staggers the stream so it never stops. */
function Sheet({ x, y, cls }: { x: number; y: number; cls: string }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <g className={cls}>
        <use href="#kmbSheet" />
      </g>
    </g>
  );
}

export function HeroScene() {
  return (
    <div className={styles.scene} aria-hidden="true">
      <svg
        className={styles.sceneSvg}
        viewBox="0 0 1440 460"
        preserveAspectRatio="xMidYMax slice"
        role="presentation"
        focusable="false"
      >
        <defs>
          <linearGradient id="kmbWall" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--scene-sky-a)" />
            <stop offset="100%" stopColor="var(--scene-sky-b)" />
          </linearGradient>

          {/* The light source is the screen. */}
          <radialGradient id="kmbGlow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="var(--scene-sun)" stopOpacity="0.85" />
            <stop offset="45%" stopColor="var(--scene-sun)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--scene-sun)" stopOpacity="0" />
          </radialGradient>

          {/* A single sheet of the old book: ruled, with entries on it. */}
          <g id="kmbSheet">
            <rect x="-25" y="-32" width="50" height="64" rx="3" fill="var(--scene-paper)" />
            <g fill="var(--scene-ink)" opacity="0.6">
              <rect x="-18" y="-23" width="25" height="3" rx="1.5" />
              <rect x="-18" y="-15" width="32" height="3" rx="1.5" />
              <rect x="-18" y="-7" width="20" height="3" rx="1.5" />
              <rect x="-18" y="1" width="30" height="3" rx="1.5" />
              <rect x="-18" y="9" width="15" height="3" rx="1.5" />
              <rect x="-18" y="17" width="26" height="3" rx="1.5" />
            </g>
          </g>

          {/* A closed, filled ledger — one of many. */}
          <g id="kmbBook">
            <rect x="-46" y="-13" width="92" height="13" rx="2.5" fill="var(--scene-mid)" />
            <rect x="-46" y="-13" width="7" height="13" fill="var(--scene-near)" />
            <rect x="-33" y="-9.5" width="70" height="2" rx="1" fill="var(--scene-paper)" opacity="0.5" />
          </g>
        </defs>

        {/* ── Room ── */}
        <rect width="1440" height="460" fill="url(#kmbWall)" />
        <g className={styles.glow}>
          <ellipse cx="1276" cy="300" rx="300" ry="240" fill="url(#kmbGlow)" />
        </g>

        {/*
          The archive behind the desk: a shelf of filled ledgers, years of them.
          Sits low enough to stay inside the band the scrim leaves visible.
        */}
        <g fill="var(--scene-far)" className={styles.roomBack}>
          <rect x="548" y="286" width="392" height="6" />
          <g>
            <rect x="566" y="244" width="17" height="42" /><rect x="588" y="252" width="13" height="34" />
            <rect x="606" y="238" width="19" height="48" /><rect x="630" y="256" width="12" height="30" />
            <rect x="647" y="246" width="16" height="40" /><rect x="668" y="250" width="14" height="36" />
            <rect x="687" y="240" width="18" height="46" /><rect x="710" y="258" width="12" height="28" />
            <rect x="727" y="248" width="15" height="38" /><rect x="747" y="242" width="17" height="44" />
            <rect x="769" y="254" width="13" height="32" /><rect x="787" y="246" width="16" height="40" />
          </g>
        </g>

        {/* ── The paper side ── */}
        <g className={styles.paperSide}>
          {/* Filled books, closed and stacked. */}
          <g>
            <use href="#kmbBook" x="620" y="400" />
            <use href="#kmbBook" x="613" y="384" />
            <use href="#kmbBook" x="626" y="368" />
          </g>

          {/* The book in use: ruled, two columns, entries in a hand. */}
          <g transform="translate(830,400)">
            <path d="M-146 0 L-138 -58 L-4 -66 L-4 0 Z" fill="var(--scene-paper)" />
            <path d="M146 0 L138 -58 L4 -66 L4 0 Z" fill="var(--scene-paper)" />
            <rect x="-4.5" y="-66" width="9" height="66" fill="var(--scene-near)" />
            <g fill="var(--scene-ink)" className={styles.entries}>
              <rect x="-128" y="-54" width="52" height="3.4" rx="1.7" />
              <rect x="-68" y="-54" width="26" height="3.4" rx="1.7" />
              <rect x="-128" y="-44" width="44" height="3.4" rx="1.7" />
              <rect x="-68" y="-44" width="31" height="3.4" rx="1.7" />
              <rect x="-128" y="-34" width="56" height="3.4" rx="1.7" />
              <rect x="-68" y="-34" width="22" height="3.4" rx="1.7" />
              <rect x="-128" y="-24" width="38" height="3.4" rx="1.7" />
              <rect x="-68" y="-24" width="33" height="3.4" rx="1.7" />
              <rect x="-128" y="-14" width="49" height="3.4" rx="1.7" />
              <rect x="-68" y="-14" width="19" height="3.4" rx="1.7" />
              <rect x="22" y="-54" width="47" height="3.4" rx="1.7" />
              <rect x="78" y="-54" width="29" height="3.4" rx="1.7" />
              <rect x="22" y="-44" width="54" height="3.4" rx="1.7" />
              <rect x="78" y="-44" width="23" height="3.4" rx="1.7" />
              <rect x="22" y="-34" width="36" height="3.4" rx="1.7" />
              <rect x="78" y="-34" width="31" height="3.4" rx="1.7" />
              <rect x="22" y="-24" width="45" height="3.4" rx="1.7" />
            </g>
          </g>

          {/* Receipts on a spike, and the pen that wrote all of it. */}
          <g fill="var(--scene-paper)">
            <rect x="1000" y="344" width="40" height="52" rx="2.5" transform="rotate(-8 1020 370)" />
            <rect x="1010" y="336" width="40" height="52" rx="2.5" transform="rotate(6 1030 362)" />
          </g>
          <rect x="1024" y="300" width="4" height="100" fill="var(--scene-near)" />
          <rect x="700" y="390" width="74" height="5.5" rx="2.7" fill="var(--scene-near)" transform="rotate(-9 737 393)" />
        </g>

        {/* ── The sheets leaving the book ── */}
        <g className={styles.flight}>
          <Sheet x={830} y={352} cls={styles.fly1} />
          <Sheet x={830} y={352} cls={styles.fly2} />
          <Sheet x={830} y={352} cls={styles.fly3} />
          <Sheet x={830} y={352} cls={styles.fly4} />
        </g>

        {/* ── The device: the same records, kept for them ── */}
        <g className={styles.deviceSide}>
          <rect x="1212" y="222" width="150" height="178" rx="18" fill="var(--scene-near)" />
          <rect x="1221" y="231" width="132" height="169" rx="11" fill="var(--scene-screen)" />
          <rect x="1269" y="238" width="36" height="4.5" rx="2.2" fill="var(--scene-near)" opacity="0.65" />

          <g fill="var(--scene-accent)">
            <g className={styles.row1}>
              <rect x="1233" y="258" width="62" height="7" rx="3.5" />
              <rect x="1312" y="258" width="29" height="7" rx="3.5" opacity="0.55" />
            </g>
            <g className={styles.row2}>
              <rect x="1233" y="279" width="52" height="7" rx="3.5" />
              <rect x="1312" y="279" width="29" height="7" rx="3.5" opacity="0.55" />
            </g>
            <g className={styles.row3}>
              <rect x="1233" y="300" width="69" height="7" rx="3.5" />
              <rect x="1312" y="300" width="29" height="7" rx="3.5" opacity="0.55" />
            </g>
            <g className={styles.row4}>
              <rect x="1233" y="321" width="45" height="7" rx="3.5" />
              <rect x="1312" y="321" width="29" height="7" rx="3.5" opacity="0.55" />
            </g>
            <g className={styles.row5}>
              <rect x="1233" y="342" width="58" height="7" rx="3.5" />
              <rect x="1312" y="342" width="29" height="7" rx="3.5" opacity="0.55" />
            </g>
          </g>
          <rect x="1233" y="368" width="108" height="16" rx="8" fill="var(--scene-accent)" opacity="0.92" />
        </g>

        {/* ── Desk ── */}
        <g>
          <rect x="-70" y="400" width="1580" height="13" fill="var(--scene-near)" />
          <rect x="-70" y="413" width="1580" height="47" fill="var(--scene-mid)" />
        </g>

      </svg>

      <div className={styles.sceneScrim} />
    </div>
  );
}
