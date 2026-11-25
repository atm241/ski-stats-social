import type { SkiDay } from "@/generated/prisma/client";
import type { StoredTrack } from "./analysis/process";
import type { Segment } from "./analysis/types";

/** A day as queries return it by default: everything but the GPS track (see db.ts). */
export type Day = Omit<SkiDay, "track" | "segments">;

/** Pass as `omit` to load a day's track and segments too. */
export const WITH_TRACK = { track: false, segments: false } as const;

export function dayDetail(day: Pick<SkiDay, "track" | "segments" | "flagReasons">) {
  return {
    track: JSON.parse(day.track) as StoredTrack,
    segments: JSON.parse(day.segments) as Segment[],
    flagReasons: day.flagReasons ? (JSON.parse(day.flagReasons) as string[]) : [],
  };
}
