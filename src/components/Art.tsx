/** Brand mark: a ridge line in the accent colour on a dark tile. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#171c25" stroke="#2e3646" />
      <path d="M5 23 L12.5 12 L17 18 L20.5 14 L27 23" fill="none" stroke="#5cc8ff" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
