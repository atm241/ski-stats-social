/**
 * Re-labels saved days' runs and lift rides from the current trail maps. Run after rebuilding a
 * mountain, since trail stats, completion and trail boards read the run index, not the raw tracks.
 *
 *   npm run runs:reindex              # every day at a mapped resort
 *   npm run runs:reindex -- park-city # one mountain
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { reindexDays } from "../src/lib/runs";

const mountain = process.argv[2];
const t0 = Date.now();
const { days, runs } = await reindexDays(mountain);
console.log(`Reindexed ${days} days (${runs} named runs)${mountain ? ` at ${mountain}` : ""} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await prisma.$disconnect();
