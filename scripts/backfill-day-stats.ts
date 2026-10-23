/** Recomputes derived per-day stats (ski/lift time, longest run, ...) from stored segments. */
import { dayExtras } from "../src/lib/analysis/extras";
import type { Segment } from "../src/lib/analysis/types";
import { prisma } from "../src/lib/db";

async function main() {
  const days = await prisma.skiDay.findMany({ select: { id: true, segments: true } });
  for (const d of days) {
    await prisma.skiDay.update({ where: { id: d.id }, data: dayExtras(JSON.parse(d.segments) as Segment[]) });
  }
  console.log(`backfilled ${days.length} days`);
}

main().finally(() => prisma.$disconnect());
