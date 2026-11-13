import { useId } from 'react';

interface Props {
  size?: number;
  className?: string;
}

/**
 * The KMB-Talk mark: a paper K on a malachite tile, its copper leg crossing
 * over the arm ("Know what you are owed. Know what you owe.").
 *
 * Same drawing, in the same 1024 space, as the mobile app's
 * `apps/mobile/assets/src/logo-mark.svg` (launcher icon, splash, Play listing).
 * Change one, change the other. The crossing gap is a mask, so the mark sits on
 * any background. Ids come from `useId` so several logos on a page don't share
 * one gradient.
 */
export function KmbLogo({ size = 36, className }: Props): React.JSX.Element {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const field = `kmb-field-${uid}`;
  const copper = `kmb-copper-${uid}`;
  const cross = `kmb-cross-${uid}`;
  return (
    <svg
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="KMB-Talk"
    >
      <defs>
        <radialGradient id={field} gradientUnits="userSpaceOnUse" cx="330" cy="260" r="900">
          <stop offset="0" stopColor="#1E9E76" />
          <stop offset="0.5" stopColor="#0E7A5B" />
          <stop offset="1" stopColor="#094A37" />
        </radialGradient>
        <linearGradient id={copper} gradientUnits="userSpaceOnUse" x1="564" y1="446" x2="746" y2="760">
          <stop offset="0" stopColor="#F2A86C" />
          <stop offset="1" stopColor="#C25E27" />
        </linearGradient>
        <mask id={cross} maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
          <rect width="1024" height="1024" fill="#FFFFFF" />
          <path d="M564 446 L 746 760" stroke="#000000" strokeWidth="172" strokeLinecap="round" />
        </mask>
      </defs>
      <rect width="1024" height="1024" rx="230" fill={`url(#${field})`} />
      <g fill="none" strokeLinecap="round" strokeWidth="112">
        <g mask={`url(#${cross})`} stroke="#F3ECDF">
          <path d="M370 264 V 760" />
          <path d="M370 600 L 706 264" />
        </g>
        <path d="M564 446 L 746 760" stroke={`url(#${copper})`} />
      </g>
    </svg>
  );
}
