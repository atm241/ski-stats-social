/**
 * Recomputes every stored season total (the leaderboards read these). Saving and deleting days keeps
 * them current; run this after changing how totals are counted, or after editing days by hand.
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { rebuildSeasonTotals } from "../src/lib/days";

console.log(`Rebuilt ${await rebuildSeasonTotals()} season totals`);
await prisma.$disconnect();
