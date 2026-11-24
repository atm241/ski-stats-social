import { Unzip, UnzipInflate, UnzipPassThrough } from "fflate";

/*
 * Reads an Apple Health "Export All Health Data" zip in the browser and pulls out only the GPS routes
 * of skiing / snowboarding workouts. The export can be gigabytes, so it is streamed twice and nothing
 * but the matching route files is kept in memory or sent anywhere.
 */

/** Workout types that are skiing days. */
const SKI_TYPES = ["HKWorkoutActivityTypeDownhillSkiing", "HKWorkoutActivityTypeSnowboarding", "HKWorkoutActivityTypeSnowSports", "HKWorkoutActivityTypeCrossCountrySkiing"];

export interface SkiWorkout {
  type: string;
  startDate: string;
  /** zip entry name of the route, e.g. "apple_health_export/workout-routes/route_2026-02-14_9.31am.gpx" */
  routePath: string;
}

type Progress = (bytesRead: number, total: number) => void;

async function streamZip(file: Blob, onFile: (name: string) => ((chunk: Uint8Array, final: boolean) => void) | null, progress?: Progress) {
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.register(UnzipPassThrough);
  unzip.onfile = (f) => {
    const sink = onFile(f.name);
    if (!sink) return;
    f.ondata = (err, chunk, final) => {
      if (err) throw err;
      sink(chunk, final);
    };
    f.start();
  };
  const reader = file.stream().getReader();
  let read = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      unzip.push(new Uint8Array(0), true);
      break;
    }
    read += value.length;
    unzip.push(value, false);
    progress?.(read, file.size);
  }
}

/** The main export document: "export.xml" (localised names like "Export.xml" exist too), not the CDA file. */
const isExportXml = (name: string) => /^[^/]+\/[^/]+\.xml$/i.test(name) && !/cda/i.test(name);

/** Pass 1: find ski workouts and their route files by scanning the export XML as a stream. */
export async function findSkiWorkouts(file: Blob, progress?: Progress): Promise<SkiWorkout[]> {
  const found: SkiWorkout[] = [];
  let root = "";
  await streamZip(
    file,
    (name) => {
      if (!isExportXml(name)) return null;
      root = name.split("/")[0];
      const decoder = new TextDecoder();
      let buf = "";
      return (chunk, final) => {
        buf += decoder.decode(chunk, { stream: !final });
        // Consume complete <Workout …>…</Workout> elements; keep the unfinished tail for the next chunk.
        for (;;) {
          const start = buf.indexOf("<Workout ");
          if (start < 0) {
            buf = buf.slice(-16); // could be the start of "<Workout "
            break;
          }
          const end = buf.indexOf("</Workout>", start);
          if (end < 0) {
            buf = buf.slice(start);
            break;
          }
          const el = buf.slice(start, end);
          buf = buf.slice(end + 10);
          const type = /workoutActivityType="([^"]+)"/.exec(el)?.[1] ?? "";
          if (!SKI_TYPES.includes(type)) continue;
          const startDate = /startDate="([^"]+)"/.exec(el)?.[1] ?? "";
          for (const m of el.matchAll(/<FileReference path="([^"]+\.gpx)"/g)) found.push({ type, startDate, routePath: m[1] });
        }
      };
    },
    progress,
  );
  // FileReference paths are relative to the export folder ("/workout-routes/…").
  return found.map((w) => ({ ...w, routePath: `${root}${w.routePath.startsWith("/") ? "" : "/"}${w.routePath}` }));
}

/** Pass 2: extract just the wanted route files as GPX text. */
export async function extractRoutes(file: Blob, paths: string[], progress?: Progress): Promise<{ name: string; gpx: string }[]> {
  const wanted = new Set(paths);
  const out: { name: string; gpx: string }[] = [];
  await streamZip(
    file,
    (name) => {
      if (!wanted.has(name)) return null;
      const parts: Uint8Array[] = [];
      return (chunk, final) => {
        parts.push(chunk);
        if (final) {
          const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
          let o = 0;
          for (const p of parts) {
            all.set(p, o);
            o += p.length;
          }
          out.push({ name: name.split("/").pop()!, gpx: new TextDecoder().decode(all) });
        }
      };
    },
    progress,
  );
  return out;
}
