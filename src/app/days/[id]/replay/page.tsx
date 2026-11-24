import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReplayViewer } from "@/components/ReplayViewer";
import { prisma } from "@/lib/db";
import { dayDetail } from "@/lib/days";
import { feet, prettyDate } from "@/lib/format";
import { mountainSlugForResort } from "@/lib/mountain/registry";

export default async function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const day = await prisma.skiDay.findUnique({ where: { id }, include: { user: true } });
  if (!day) notFound();
  const slug = await mountainSlugForResort(day.resortName);
  const { track, segments } = dayDetail(day);
  const title = `${day.user.displayName} · ${day.resortName} · ${prettyDate(day.localDate, { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href={`/days/${day.id}`} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
            <ArrowLeft size={14} aria-hidden /> Back to the day
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Replay</h1>
          <p className="num mt-1 text-sm text-ink-soft">
            {title} · {feet(day.verticalM)} ft over {day.runCount} runs
          </p>
        </div>
      </div>
      {slug ? (
        <ReplayViewer
          slug={slug}
          track={track}
          segments={segments}
          timeZone={day.timezone}
          rider={{ avatar: day.user.avatar, displayName: day.user.displayName }}
          title={title}
        />
      ) : (
        <p className="card p-6 text-center text-sm text-ink-soft">There&apos;s no 3D model of {day.resortName ?? "this area"} yet.</p>
      )}
      <p className="text-xs text-ink-faint">Lunch and lift lines are sped through so the skiing gets the screen time. Drag to look around; the camera swings back behind you after a few seconds.</p>
    </div>
  );
}
