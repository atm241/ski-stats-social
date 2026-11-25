import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReplayViewer } from "@/components/ReplayViewer";
import { prisma } from "@/lib/db";
import { dayDetail } from "@/lib/days";
import { feet, prettyDate } from "@/lib/format";
import { mountainSlugForResort } from "@/lib/mountain/registry";
import { skiedWith } from "@/lib/social";

/** "Dana · Alta Ski Area, Feb 15" */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const day = await prisma.skiDay.findUnique({ where: { id }, select: { resortName: true, localDate: true, user: { select: { displayName: true } } } });
  if (!day) return { title: "Not found" };
  return { title: `Replay: ${day.user.displayName} · ${day.resortName ?? "Backcountry"}, ${prettyDate(day.localDate, { month: "short", day: "numeric" })}` };
}

export default async function ReplayPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ embed?: string }> }) {
  const { id } = await params;
  const embed = (await searchParams).embed === "1";
  const day = await prisma.skiDay.findUnique({ where: { id }, include: { user: true } });
  if (!day) notFound();
  const slug = await mountainSlugForResort(day.resortName);
  const { track, segments } = dayDetail(day);
  // friends who skied with them ride along in the replay
  const companions = slug ? await skiedWith(day) : [];
  const title = `${day.user.displayName} · ${day.resortName} · ${prettyDate(day.localDate, { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div className="space-y-4" data-embed={embed || undefined}>
      <div className="flex flex-wrap items-end justify-between gap-2" data-embed-hide>
        <div>
          <Link href={`/days/${day.id}`} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
            <ArrowLeft size={14} aria-hidden /> Back to the day
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Replay</h1>
          <p className="num mt-1 text-sm text-ink-soft">
            {title} · {feet(day.verticalM)} ft over {day.runCount} runs
          </p>
          {companions.length > 0 && (
            <p className="mt-1 text-sm text-ink-soft">
              Skiing with {companions.map((c) => `${c.user.displayName} (${c.runs} ${c.runs === 1 ? "run" : "runs"} together)`).join(", ")}
            </p>
          )}
        </div>
      </div>
      {slug ? (
        <ReplayViewer
          slug={slug}
          track={track}
          segments={segments}
          timeZone={day.timezone}
          rider={{ avatar: day.user.avatar, displayName: day.user.displayName }}
          companions={companions.map((c) => ({ ...dayDetail(c.day), rider: { avatar: c.user.avatar, displayName: c.user.displayName } }))}
          title={title}
        />
      ) : (
        <p className="card p-6 text-center text-sm text-ink-soft">There&apos;s no 3D model of {day.resortName ?? "this area"} yet.</p>
      )}
      <p className="text-xs text-ink-faint" data-embed-hide>Lunch and lift lines are sped through so the skiing gets the screen time. Drag to look around; the camera swings back behind you after a few seconds.</p>
    </div>
  );
}
