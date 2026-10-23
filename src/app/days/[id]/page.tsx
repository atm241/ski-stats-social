import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteDay } from "@/app/actions";
import { Avatar } from "@/components/Avatar";
import { KIND_CHIP } from "@/components/DayCard";
import { DayBreakdown } from "@/components/DayBreakdown";
import { DayViz } from "@/components/DayViz";
import { StatTile } from "@/components/StatTile";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dayDetail } from "@/lib/days";
import { clockTime, duration, feet, miles, mph, prettyDate } from "@/lib/format";

export default async function DayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [day, me] = await Promise.all([prisma.skiDay.findUnique({ where: { id }, include: { user: true } }), currentUser()]);
  if (!day) notFound();

  const { track, segments, flagReasons } = dayDetail(day);
  const runs = segments.filter((s) => s.kind === "run");
  const chip = KIND_CHIP[day.kind] ?? KIND_CHIP.resort;
  const isMine = me?.id === day.userId;

  return (
    <div className="space-y-5 pt-2">
      <div className="flex flex-wrap items-center gap-4">
        <Link href={`/u/${day.user.username}`}>
          <Avatar user={day.user} size={56} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink-soft">
            <Link href={`/u/${day.user.username}`} className="hover:underline">
              {day.user.displayName}
            </Link>{" "}
            · {prettyDate(day.localDate)}
          </div>
          <h1 className="font-display text-3xl font-bold">{day.resortName ?? (day.uphillM > 0 ? "Backcountry tour" : "Backcountry laps")}</h1>
          <div className="mt-1 flex flex-wrap gap-2">
            <span className={`chip ${chip.className}`}>{chip.label}</span>
            {day.resortCountry && <span className="chip bg-white text-ink-soft ring-1 ring-line">{day.resortCountry}</span>}
            <span className="chip bg-white text-ink-soft ring-1 ring-line">
              {clockTime(day.startedAt, day.timezone)} – {clockTime(day.endedAt, day.timezone)}
            </span>
          </div>
        </div>
      </div>

      {day.flagged && (
        <div className="rounded-3xl bg-sun-soft p-4 text-sm text-[#7a5500]">
          <strong>Not on the leaderboard yet.</strong> {flagReasons.join(" ")}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon="⛰️" label="Vertical" value={feet(day.verticalM)} unit="ft" tone="sky" />
        <StatTile icon="🎿" label="Runs" value={String(day.runCount)} tone="berry" />
        {day.uphillM > 0 ? (
          <StatTile icon="🥾" label="Uphill" value={feet(day.uphillM)} unit="ft" tone="sun" />
        ) : (
          <StatTile icon="🚡" label="Lifts" value={String(day.liftCount)} tone="lilac" />
        )}
        <StatTile icon="⚡" label="Top speed" value={mph(day.maxSpeedMps)} unit="mph" tone="mint" />
      </div>

      <DayViz track={track} segments={segments} timeZone={day.timezone} />

      <DayBreakdown day={day} />

      <section className="card overflow-hidden">
        <h2 className="px-5 pt-4 font-display text-lg font-semibold">Runs</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="text-left text-xs tracking-wide text-ink-soft uppercase">
              <tr>
                <th className="px-5 py-2 font-bold">#</th>
                <th className="px-2 py-2 font-bold">Start</th>
                <th className="px-2 py-2 text-right font-bold">Vertical</th>
                <th className="px-2 py-2 text-right font-bold">Distance</th>
                <th className="px-2 py-2 text-right font-bold">Time</th>
                <th className="px-5 py-2 text-right font-bold">Top speed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {runs.map((r, i) => (
                <tr key={r.startT}>
                  <td className="px-5 py-2 font-display font-semibold text-sky-deep">{i + 1}</td>
                  <td className="px-2 py-2">{clockTime(r.startT, day.timezone)}</td>
                  <td className="px-2 py-2 text-right font-semibold">{feet(r.verticalM)} ft</td>
                  <td className="px-2 py-2 text-right">{miles(r.distanceM)} mi</td>
                  <td className="px-2 py-2 text-right">{duration(r.endT - r.startT)}</td>
                  <td className="px-5 py-2 text-right">{mph(r.maxSpeedMps)} mph</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {isMine && (
        <form action={deleteDay.bind(null, day.id)} className="text-right">
          <button className="text-sm font-semibold text-ink-soft hover:text-berry">Delete this day</button>
        </form>
      )}
    </div>
  );
}
