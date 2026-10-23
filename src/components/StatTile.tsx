const TONES = {
  sky: "bg-sky-soft text-sky-deep",
  berry: "bg-berry-soft text-berry",
  mint: "bg-mint-soft text-mint",
  sun: "bg-sun-soft text-[#c98a00]",
  lilac: "bg-lilac-soft text-lilac",
} as const;

export type Tone = keyof typeof TONES;

export function StatTile({ icon, label, value, unit, tone = "sky" }: { icon: string; label: string; value: string; unit?: string; tone?: Tone }) {
  return (
    <div className="card flex flex-col items-start gap-2 p-4 sm:flex-row sm:items-center sm:gap-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-lg sm:h-11 sm:w-11 sm:text-xl ${TONES[tone]}`} aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-xs font-bold tracking-wide text-ink-soft uppercase">{label}</div>
        <div className="font-display text-2xl font-semibold whitespace-nowrap tabular-nums">
          {value}
          {unit && <span className="ml-1 text-sm font-medium text-ink-soft">{unit}</span>}
        </div>
      </div>
    </div>
  );
}
