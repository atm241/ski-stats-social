/**
 * Builds a 3D mountain end to end: terrain + runs + lifts, then the satellite forest and lidar cliff layers.
 *
 *   npx tsx scripts/build-all.ts deer-valley
 *   npx tsx scripts/build-all.ts big-sky --from forest     # resume after a failed step
 */
import { execFileSync } from "node:child_process";

const STEPS = ["mountain", "forest", "cliffs", "parks"];
const args = process.argv.slice(2);
const fromAt = args.indexOf("--from");
const from = fromAt >= 0 ? args.splice(fromAt, 2)[1] : STEPS[0];
const [slug, ...rest] = args;
if (!slug || !STEPS.includes(from)) throw new Error(`usage: build-all.ts <slug> [--from ${STEPS.join("|")}] [--debug <dir>]`);
for (const step of STEPS.slice(STEPS.indexOf(from))) {
  console.log(`\n=== build-${step} ${slug}`);
  execFileSync("npx", ["tsx", `scripts/build-${step}.ts`, slug, ...(step === "mountain" ? [] : rest)], { stdio: "inherit" });
}
