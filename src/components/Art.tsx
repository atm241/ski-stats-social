/* Hand-drawn-ish SVG art. Kept as components so they theme with the palette. */

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <rect width="40" height="40" rx="12" fill="#5ab4ff" />
      <circle cx="29" cy="11" r="4" fill="#ffd36b" />
      <path d="M4 32 L15 15 L21 23 L26 17 L36 32 Z" fill="#fff" />
      <path d="M15 15 L11.2 20.8 L14 19.6 L16 21.4 L18 19.6 Z" fill="#cfe7ff" />
    </svg>
  );
}

export function MountainHero({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 800 260" className={className} aria-hidden preserveAspectRatio="xMidYMax slice">
      <circle cx="660" cy="128" r="48" fill="#fff3c4" />
      <circle cx="660" cy="128" r="32" fill="#ffd36b" />
      <g fill="#fff" opacity="0.9">
        <ellipse cx="150" cy="122" rx="46" ry="14" />
        <ellipse cx="180" cy="112" rx="30" ry="14" />
        <ellipse cx="470" cy="108" rx="36" ry="11" />
      </g>
      <path d="M0 200 L120 90 L210 160 L320 60 L430 150 L520 80 L640 170 L720 110 L800 160 L800 260 L0 260 Z" fill="#c9c0ff" />
      <path d="M0 230 L90 150 L190 210 L300 110 L400 200 L520 120 L640 210 L740 150 L800 190 L800 260 L0 260 Z" fill="#8ccaff" />
      <path d="M300 110 L272 136 L290 130 L304 142 L318 128 L330 135 Z" fill="#fff" />
      <path d="M520 120 L494 144 L511 139 L524 150 L538 137 L548 142 Z" fill="#fff" />
      <path d="M0 260 L0 235 Q200 190 400 225 T800 220 L800 260 Z" fill="#fff" />
      <path d="M520 128 C500 160 560 170 530 200 C505 222 470 215 460 240" fill="none" stroke="#ff6b9a" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 8" />
      <g transform="translate(452 236)">
        <circle r="7" fill="#ff6b9a" />
        <circle cy="-11" r="4.5" fill="#1f2b4d" />
      </g>
    </svg>
  );
}

export function Snowflakes({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 40" className={className} aria-hidden>
      {[
        [10, 10, 3],
        [30, 28, 2],
        [55, 8, 2.5],
        [78, 24, 3],
        [92, 6, 2],
      ].map(([x, y, r]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#fff" />
      ))}
    </svg>
  );
}
