import type { SkiDay, User } from "@prisma/client";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { feet, mph } from "@/lib/format";
import { Avatar } from "./Avatar";

const KIND: Record<string, string> = { resort: "Resort", backcountry: "Backcountry", mixed: "Resort + uphill" };

/** One ski day as a compact row: date block, where, and the headline numbers. */
export function DayCard({ day, user }: { day: SkiDay; user?: User }) {
  const d = new Date(`${day.localDate}T12:00:00Z`);
  return (
    <Link href={`/days/${day.id}`} className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-raised">
      <div className="w-11 shrink-0 text-center">
        <div className="text-[10px] font-medium tracking-widest text-ink-faint uppercase">{d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}</div>
        <div className="num text-xl leading-tight font-semibold">{d.getUTCDate()}</div>
      </div>
      {user && <Avatar user={user} size={32} />}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{day.resortName ?? (day.uphillM > 0 ? "Backcountry tour" : "Backcountry laps")}</div>
        <div className="truncate text-xs text-ink-soft">
          {user && <span className="text-ink">{user.displayName} · </span>}
          {d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })} · {KIND[day.kind] ?? "Resort"}
          {day.flagged && <span className="text-warn"> · needs review</span>}
        </div>
      </div>
      <div className="hidden text-right sm:block">
        <div className="num text-sm">{day.runCount}</div>
        <div className="text-[11px] text-ink-faint">runs</div>
      </div>
      <div className="hidden w-14 text-right sm:block">
        <div className="num text-sm">{mph(day.maxSpeedMps)}</div>
        <div className="text-[11px] text-ink-faint">mph</div>
      </div>
      <div className="w-20 text-right">
        <div className="num font-semibold text-vert">{feet(day.verticalM)}</div>
        <div className="text-[11px] text-ink-faint">ft</div>
      </div>
      <ChevronRight size={16} className="shrink-0 text-ink-faint transition-colors group-hover:text-ink-soft" aria-hidden />
    </Link>
  );
}
