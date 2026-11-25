import Link from "next/link";
import type { Completion, CompletionLevel } from "@/lib/completion";
import { DIFFICULTY_COLOR } from "./ui";

const LEVEL_NAME: Record<CompletionLevel, string> = { easy: "Green", intermediate: "Blue", advanced: "Black", expert: "Double black", freeride: "Freeride", other: "Unrated" };
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Thin meter: fill carries the colour, the track is a faint step of the same surface. */
function Meter({ value, total, color = "var(--color-accent)" }: { value: number; total: number; color?: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-hover" role="meter" aria-valuemin={0} aria-valuemax={total} aria-valuenow={value}>
      <div className="h-full rounded-full" style={{ width: `${pct(value, total)}%`, background: color }} />
    </div>
  );
}

/** "Ski every run" progress at one mountain, split by difficulty. */
export function CompletionCard({ c }: { c: Completion }) {
  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="num text-3xl font-semibold tracking-tight">
          {c.skied}
          <span className="text-lg font-normal text-ink-soft"> of {c.total} runs</span>
        </div>
        <div className="num text-sm text-ink-soft">{pct(c.skied, c.total)}%</div>
      </div>
      <div className="mt-3">
        <Meter value={c.skied} total={c.total} />
      </div>
      <ul className="mt-5 space-y-3 text-sm">
        {c.byLevel.map((b) => (
          <li key={b.level}>
            <div className="mb-1 flex justify-between">
              <span className="text-ink-soft">{LEVEL_NAME[b.level]}</span>
              <span className="num">
                {b.skied}
                <span className="text-ink-faint"> / {b.total}</span>
              </span>
            </div>
            <Meter value={b.skied} total={b.total} color={DIFFICULTY_COLOR[b.level] ?? "var(--color-ink-faint)"} />
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-ink-faint">A run counts once you&apos;ve skied a good part of it, not just crossed it. Turn on “My runs” on the map to see them.</p>
    </div>
  );
}

/** One line per mountain: name, runs skied, meter. For profiles. */
export function CompletionList({ items }: { items: ({ slug: string; name: string } & Completion)[] }) {
  return (
    <ul className="card divide-y divide-line overflow-hidden">
      {items.map((m) => (
        <li key={m.slug}>
          <Link href={`/mountains/${m.slug}`} className="block px-4 py-3 transition-colors hover:bg-raised">
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium">{m.name}</span>
              <span className="num shrink-0 text-ink-soft">
                {m.skied} of {m.total} runs · {pct(m.skied, m.total)}%
              </span>
            </div>
            <Meter value={m.skied} total={m.total} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
