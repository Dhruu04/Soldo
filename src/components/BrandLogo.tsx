interface Props {
  className?: string;
  size?: number;
}

/**
 * Soldo brand mark — a stacked-coin glyph with an "S" cut into the top coin.
 * Uses currentColor so it inherits the surrounding text/icon color.
 */
export function BrandLogo({ className, size = 36 }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-label="Soldo"
      role="img"
      translate="no"
    >
      <defs>
        <linearGradient id="soldo-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.95" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.65" />
        </linearGradient>
      </defs>
      {/* lower coin (depth) */}
      <ellipse cx="32" cy="48" rx="22" ry="6" fill="currentColor" opacity="0.25" />
      {/* coin body */}
      <circle cx="32" cy="30" r="22" fill="url(#soldo-g)" />
      {/* inner ring */}
      <circle cx="32" cy="30" r="17" fill="none" stroke="white" strokeOpacity="0.85" strokeWidth="1.5" />
      {/* S monogram */}
      <path
        d="M38.5 23.5c-1.6-1.6-4.2-2.5-6.7-2.5-3.6 0-6.3 1.9-6.3 4.9 0 2.7 2.1 4.1 5.4 4.8l2.2.5c2 .4 3.1 1 3.1 2.2 0 1.4-1.5 2.3-3.7 2.3-2.3 0-4.4-.9-5.8-2.4l-2.1 2.2c1.9 2 4.7 3.1 7.8 3.1 4.1 0 7.1-2 7.1-5.2 0-2.9-2.2-4.3-5.6-5l-2.2-.5c-1.8-.4-2.9-.9-2.9-2.1 0-1.3 1.4-2.1 3.4-2.1 1.9 0 3.7.7 4.9 1.9l1.4-2.1z"
        fill="white"
      />
    </svg>
  );
}
