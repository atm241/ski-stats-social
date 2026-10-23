import type { SkiDay, User } from "@prisma/client";
import Link from "next/link";
import { feet, prettyDate } from "@/lib/format";
import { Avatar } from "./Avatar";

export const KIND_CHIP: Record<string, { label: string; className: string }> = {
  resort: { label: "🚡 Resort", className: "bg-sky-soft text-sky-deep" },
  backcountry: { label: "🥾 Backcountry", className: "bg-[#fdebd9] text-[#a55a12]" },
  mixed: { label: "🚡🥾 Resort + skin", className: "bg-lilac-soft text-lilac" },
};

export function DayCard({ day, user }: { day: SkiDay; user?: User }) {
  const chip = KIND_CHIP[day.kind] ?? KIND_CHIP.resort;
  return (
    <Link href={`/days/${day.id}`} className="card flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-lg">
      {user && <Avatar user={user} size={40} />}
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-[17px] font-semibold">{day.resortName ?? "Backcountry tour"}</div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
          {user && <span className="font-semibold text-ink">{user.displayName}</span>}
          <span>{prettyDate(day.localDate, { weekday: "short", month: "short", day: "numeric" })}</span>
          <span className={`chip ${chip.className}`}>{chip.label}</span>
          {day.flagged && <span className="chip bg-sun-soft text-[#a06e00]">needs review</span>}
        </div>
      </div>
      <div className="text-right">
        <div className="font-display text-lg font-semibold tabular-nums text-sky-deep">{feet(day.verticalM)} ft</div>
        <div className="text-xs text-ink-soft">
          {day.runCount} {day.runCount === 1 ? "run" : "runs"}
        </div>
      </div>
    </Link>
  );
}
