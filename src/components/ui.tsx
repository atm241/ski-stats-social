import type { LucideIcon } from "lucide-react";

/** North American trail-rating symbol: ● green, ■ blue, ◆ black, ◆◆ double black, ▲ freeride/park. */
export function Difficulty({ level, size = 12 }: { level: string | null | undefined; size?: number }) {
  return <span className="inline-flex shrink-0">{symbol(level, size)}</span>;
}

function symbol(level: string | null | undefined, s: number) {
  switch (level) {
    case "novice":
    case "easy":
      return (
        <svg width={s} height={s} viewBox="0 0 12 12" aria-label="Green">
          <circle cx="6" cy="6" r="5.2" fill="var(--color-green-run)" />
        </svg>
      );
    case "intermediate":
      return (
        <svg width={s} height={s} viewBox="0 0 12 12" aria-label="Blue">
          <rect x="1" y="1" width="10" height="10" rx="1" fill="var(--color-blue-run)" />
        </svg>
      );
    case "advanced":
      return (
        <svg width={s} height={s} viewBox="0 0 12 12" aria-label="Black diamond">
          <rect x="2.2" y="2.2" width="7.6" height="7.6" transform="rotate(45 6 6)" fill="var(--color-black-run)" />
        </svg>
      );
    case "expert":
      return (
        <svg width={s * 1.8} height={s} viewBox="0 0 22 12" aria-label="Double black diamond">
          <rect x="2.2" y="2.2" width="7.6" height="7.6" transform="rotate(45 6 6)" fill="var(--color-black-run)" />
          <rect x="12.2" y="2.2" width="7.6" height="7.6" transform="rotate(45 16 6)" fill="var(--color-black-run)" />
        </svg>
      );
    case "freeride":
    case "extreme":
      return (
        <svg width={s} height={s} viewBox="0 0 12 12" aria-label="Expert / off-piste">
          <path d="M6 1 L11 11 H1 Z" fill="var(--color-orange-run)" />
        </svg>
      );
    default:
      return (
        <svg width={s} height={s} viewBox="0 0 12 12" aria-label="Unrated">
          <circle cx="6" cy="6" r="4.5" fill="none" stroke="var(--color-ink-faint)" strokeWidth="1.5" />
        </svg>
      );
  }
}

export const DIFFICULTY_ORDER = ["easy", "intermediate", "advanced", "expert", "freeride"] as const;
export const DIFFICULTY_NAME: Record<string, string> = {
  novice: "Green",
  easy: "Green",
  intermediate: "Blue",
  advanced: "Black",
  expert: "Double black",
  freeride: "Off-piste",
  extreme: "Off-piste",
};
export const DIFFICULTY_COLOR: Record<string, string> = {
  easy: "var(--color-green-run)",
  intermediate: "var(--color-blue-run)",
  advanced: "var(--color-black-run)",
  expert: "#9ca3af",
  freeride: "var(--color-orange-run)",
};
/** novice → easy, extreme → freeride, unknown → null */
export const normDifficulty = (d: string | null | undefined) =>
  d === "novice" ? "easy" : d === "extreme" ? "freeride" : d && d in DIFFICULTY_COLOR ? d : null;

/** Big number with a small unit and label: the basic unit of every stats screen. */
export function Stat({
  label,
  value,
  unit,
  icon: Icon,
  accent,
  size = "md",
  sub,
}: {
  label: string;
  value: string;
  unit?: string;
  icon?: LucideIcon;
  accent?: string;
  size?: "sm" | "md" | "lg";
  sub?: React.ReactNode;
}) {
  const v = size === "lg" ? "text-4xl sm:text-5xl" : size === "md" ? "text-2xl" : "text-lg";
  return (
    <div className="min-w-0">
      <div className="label flex items-center gap-1.5">
        {Icon && <Icon size={13} strokeWidth={2} style={{ color: accent }} aria-hidden />}
        {label}
      </div>
      <div className={`num mt-1 font-semibold whitespace-nowrap ${v}`}>
        {value}
        {unit && <span className="ml-1 font-sans text-[0.45em] font-medium tracking-normal text-ink-soft">{unit}</span>}
      </div>
      {sub && <div className="mt-0.5 text-xs text-ink-soft">{sub}</div>}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="text-[15px] font-semibold tracking-tight">{children}</h2>
      {right && <div className="text-sm text-ink-soft">{right}</div>}
    </div>
  );
}
