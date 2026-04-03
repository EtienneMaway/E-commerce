interface Props {
  size?: number;
  className?: string;
}

export function KmbLogo({ size = 36, className }: Props) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      className={className}
    >
      <defs>
        <linearGradient id="kmb-bg" x1="0" y1="0" x2="48" y2="48">
          <stop offset="0%" stopColor="#4F46E5" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="url(#kmb-bg)" />
      {/* K */}
      <path
        d="M10 13v22M10 24l7-11M10 24l7 11"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* M */}
      <path
        d="M20 35V13l5 10 5-10v22"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* B */}
      <path
        d="M33 13h4a4 4 0 010 8h-4m0-8v8m0 0h4.5a4.5 4.5 0 010 9H33v-9"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
