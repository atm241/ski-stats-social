import {
  configureBackgroundTypes,
  isHealthDataAvailable,
  queryWorkoutSamples,
  requestAuthorization,
  saveWorkoutSample,
  subscribeToChanges,
  UpdateFrequency,
  WorkoutActivityType,
  type WorkoutProxyTyped,
} from "@kingstinct/react-native-healthkit";
import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import type { ApiUploadResponse } from "@shared/apiTypes";
import { gpxFromLocations } from "@shared/gpx/fromLocations";
import { api } from "./api";

/**
 * Apple Health sync (iOS): ski and snowboard workouts with GPS routes become GPX uploads. New Apple
 * Watch sessions sync on their own, in the background via HealthKit background delivery and whenever
 * the app opens. The server skips days it already has, so a resend is harmless.
 */

export const healthSupported = Platform.OS === "ios" && isHealthDataAvailable();

const SKI_TYPES = [WorkoutActivityType.downhillSkiing, WorkoutActivityType.snowboarding, WorkoutActivityType.snowSports, WorkoutActivityType.crossCountrySkiing];
const TYPE_LABEL: Partial<Record<WorkoutActivityType, string>> = {
  [WorkoutActivityType.downhillSkiing]: "Downhill skiing",
  [WorkoutActivityType.snowboarding]: "Snowboarding",
  [WorkoutActivityType.crossCountrySkiing]: "Cross-country skiing",
};
const WORKOUTS = "HKWorkoutTypeIdentifier";
const ROUTES = "HKWorkoutRouteTypeIdentifier";
const BATCH = 5;
/** Fewer fixes than this is a workout without GPS: mark it done instead of retrying forever. */
const MIN_FIXES = 10;

// ---- what's been sent, kept in a small file in the app's documents

interface State {
  enabled: boolean;
  synced: string[];
  lastSync: string | null;
}
const stateFile = () => new File(Paths.document, "health-sync.json");

export function loadState(): State {
  try {
    const f = stateFile();
    if (f.exists) return { enabled: false, synced: [], lastSync: null, ...(JSON.parse(f.textSync()) as Partial<State>) };
  } catch {
    // unreadable: start over (the server dedupes days anyway)
  }
  return { enabled: false, synced: [], lastSync: null };
}

function saveState(patch: Partial<State>) {
  const next = { ...loadState(), ...patch };
  stateFile().writeSync(JSON.stringify(next));
  return next;
}

// ---- HealthKit

/** Asks for read access to workouts and routes and turns on background delivery. */
export async function enableHealthSync() {
  await requestAuthorization({ toRead: [WORKOUTS, ROUTES] });
  await configureBackgroundTypes([WORKOUTS], UpdateFrequency.immediate);
  saveState({ enabled: true });
}

export function disableHealthSync() {
  saveState({ enabled: false });
}

export interface HealthWorkout {
  id: string;
  start: Date;
  end: Date;
  label: string;
  synced: boolean;
}

async function skiWorkoutProxies(limit: number) {
  return queryWorkoutSamples({ limit, ascending: false, filter: { OR: SKI_TYPES.map((workoutActivityType) => ({ workoutActivityType })) } });
}

/** Recent ski workouts, newest first, with whether each has been sent. */
export async function recentSkiWorkouts(limit = 50): Promise<HealthWorkout[]> {
  const done = new Set(loadState().synced);
  return (await skiWorkoutProxies(limit)).map((w) => ({ id: w.uuid, start: w.startDate, end: w.endDate, label: TYPE_LABEL[w.workoutActivityType] ?? "Snow sports", synced: done.has(w.uuid) }));
}

const fileName = (w: WorkoutProxyTyped) => `route_${w.startDate.toISOString().slice(0, 10)}_${w.uuid.slice(0, 8)}.gpx`;

async function routeGpx(w: WorkoutProxyTyped): Promise<string | null> {
  const locations = (await w.getWorkoutRoutes()).flatMap((r) => r.locations);
  return locations.length < MIN_FIXES ? null : gpxFromLocations(fileName(w), locations);
}

export interface SyncResult {
  imported: number;
  message: string;
}

let running: Promise<SyncResult> | null = null;

/** Sends every ski workout not sent yet. Concurrent calls (background wake + app opening) share one run. */
export function syncHealth(token: string, onProgress?: (message: string) => void): Promise<SyncResult> {
  running ??= doSync(token, onProgress).finally(() => (running = null));
  return running;
}

async function doSync(token: string, onProgress?: (message: string) => void): Promise<SyncResult> {
  const synced = new Set(loadState().synced);
  const pending = (await skiWorkoutProxies(100)).filter((w) => !synced.has(w.uuid));
  let imported = 0;
  let batch: { id: string; name: string; gpx: string }[] = [];

  const flush = async () => {
    if (!batch.length) return;
    const res = await api<ApiUploadResponse>("/api/uploads", { method: "POST", token, body: JSON.stringify({ source: "health", files: batch.map(({ name, gpx }) => ({ name, gpx })) }) });
    res.results.forEach((r, i) => {
      imported += r.saved.length;
      if (!r.error) synced.add(batch[i].id);
    });
    saveState({ synced: [...synced] });
    batch = [];
  };

  for (const [i, w] of pending.entries()) {
    onProgress?.(`Reading route ${i + 1} of ${pending.length}…`);
    const gpx = await routeGpx(w);
    if (!gpx) {
      synced.add(w.uuid);
      continue;
    }
    batch.push({ id: w.uuid, name: fileName(w), gpx });
    if (batch.length === BATCH) await flush();
  }
  await flush();
  saveState({ synced: [...synced], lastSync: new Date().toISOString() });
  const message = !pending.length ? "Everything's synced." : imported === 0 ? "Up to date." : `Imported ${imported} new day${imported === 1 ? "" : "s"}.`;
  return { imported, message };
}

/**
 * Syncs whenever HealthKit reports a new workout. Call early (the root layout): after a background
 * wake, HealthKit's change events are held until something subscribes.
 */
export function watchHealth(token: string): () => void {
  const sub = subscribeToChanges(WORKOUTS, () => void syncHealth(token).catch(() => {}));
  return () => sub.remove();
}

// ---- development: a realistic ski day written into Health, so the sync can be tried on the simulator

export async function addSampleSkiDay(points: { t: number; lat: number; lon: number; ele: number }[]) {
  await requestAuthorization({ toRead: [WORKOUTS, ROUTES], toShare: [WORKOUTS, ROUTES] });
  const start = new Date(points[0].t);
  const end = new Date(points[points.length - 1].t);
  const workout = await saveWorkoutSample(WorkoutActivityType.downhillSkiing, [], start, end);
  await workout.saveWorkoutRoute(
    points.map((p, i) => {
      const q = points[Math.min(i + 1, points.length - 1)];
      const dt = (q.t - p.t) / 1000;
      const speed = dt > 0 ? Math.hypot((q.lat - p.lat) * 111_320, (q.lon - p.lon) * 111_320 * Math.cos((p.lat * Math.PI) / 180)) / dt : 0;
      return { latitude: p.lat, longitude: p.lon, altitude: p.ele, speed, course: -1, horizontalAccuracy: 5, verticalAccuracy: 4, date: new Date(p.t) };
    }),
  );
  return workout.uuid;
}
