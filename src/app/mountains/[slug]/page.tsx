import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { notFound } from "next/navigation";
import { MountainViewer } from "@/components/MountainViewer";
import type { MountainData } from "@/lib/mountain/types";

async function loadMountain(slug: string): Promise<MountainData | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  try {
    return JSON.parse(await readFile(join(process.cwd(), "public", "mountains", `${slug}.json`), "utf8")) as MountainData;
  } catch {
    return null;
  }
}

export default async function MountainPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadMountain(slug);
  if (!data) notFound();

  const FT = 3.28084;
  const heights = data.grid.heights;
  const vert = Math.round((Math.max(...heights) - Math.min(...heights)) * FT);

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-3xl font-bold">{data.name} in 3D</h1>
          <p className="text-ink-soft">
            {data.runs.length} runs · {data.lifts.length} lifts · ~{vert.toLocaleString()} ft of relief. Your day replays will play here soon. 🎿
          </p>
        </div>
      </div>
      <MountainViewer slug={slug} />
      <p className="text-xs text-ink-soft">{data.attribution} Terrain height exaggerated 1.25× for the low-poly look.</p>
    </div>
  );
}
