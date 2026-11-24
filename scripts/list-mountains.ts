/** Prints the configured mountain slugs, one per line (used by build-queue.sh). */
import { MOUNTAINS } from "./mountains.config";

console.log(Object.keys(MOUNTAINS).join("\n"));
