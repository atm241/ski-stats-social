import { useCallback, useEffect, useState } from "react";
import { AppState, Text, View } from "react-native";
import { API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { addSampleSkiDay, enableHealthSync, healthSupported, type HealthWorkout, loadState, recentSkiWorkouts, syncHealth, watchHealth } from "@/lib/health";
import { C } from "@/lib/theme";
import { Button, Card, s, Section } from "./ui";

const shortDate = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

/** Keeps Apple Health synced while signed in: on HealthKit changes (incl. background wakes) and on opening the app. */
export function HealthAutoSync() {
  const { token } = useAuth();
  useEffect(() => {
    if (!healthSupported || !token || !loadState().enabled) return;
    const stop = watchHealth(token);
    const sub = AppState.addEventListener("change", (state) => state === "active" && void syncHealth(token).catch(() => {}));
    return () => {
      stop();
      sub.remove();
    };
  }, [token]);
  return null;
}

/** The "Apple Health" card on your profile tab: turn sync on, see what's been sent, sync now. */
export function HealthSection() {
  const { token } = useAuth();
  const [enabled, setEnabled] = useState(() => healthSupported && loadState().enabled);
  const [workouts, setWorkouts] = useState<HealthWorkout[] | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => setWorkouts(await recentSkiWorkouts(8)), []);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    recentSkiWorkouts(8)
      .then((w) => live && setWorkouts(w))
      .catch((e) => live && setStatus(String(e)));
    return () => {
      live = false;
    };
  }, [enabled]);

  if (!healthSupported || !token) return null;

  const run = async (work: () => Promise<string | void>) => {
    setBusy(true);
    try {
      const msg = await work();
      if (msg) setStatus(msg);
      await refresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const lastSync = loadState().lastSync;
  return (
    <Section title="Apple Health">
      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        {!enabled ? (
          <>
            <Text style={{ color: C.inkSoft, fontSize: 13 }}>Log your days from Apple Watch and iPhone ski and snowboard workouts. Gapr reads only those workouts and their GPS routes. New ones sync on their own.</Text>
            <Button
              title="Sync Apple Health"
              disabled={busy}
              onPress={() =>
                run(async () => {
                  await enableHealthSync();
                  setEnabled(true);
                  return (await syncHealth(token, setStatus)).message;
                })
              }
            />
          </>
        ) : (
          <>
            <Button title={busy ? "Syncing…" : "Sync now"} disabled={busy} onPress={() => run(async () => (await syncHealth(token, setStatus)).message)} />
            <Text style={{ color: C.inkSoft, fontSize: 13 }}>
              {status || (lastSync ? `Last synced ${ago(lastSync)}.` : "New ski workouts sync automatically.")}
            </Text>
          </>
        )}
      </View>
      {enabled && workouts && workouts.length > 0 && (
        <Card style={{ marginTop: 10 }}>
          {workouts.map((w) => (
            <View key={w.id} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{shortDate(w.start)}</Text>
                <Text style={s.sub}>{w.label}</Text>
              </View>
              <Text style={{ color: w.synced ? C.good : C.inkFaint, fontSize: 13 }}>{w.synced ? "Synced" : "Waiting"}</Text>
            </View>
          ))}
        </Card>
      )}
      {enabled && workouts?.length === 0 && <Text style={{ color: C.inkFaint, fontSize: 13, paddingHorizontal: 16, marginTop: 8 }}>No ski or snowboard workouts in Health yet.</Text>}
      {__DEV__ && enabled && (
        <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
          <Button title="Dev: add a test ski day to Health" kind="ghost" disabled={busy} onPress={() => run(addTestDay)} />
        </View>
      )}
    </Section>
  );
}

/** Development builds only: a generated Park City day (yesterday), written to Health with its route. */
async function addTestDay() {
  const [{ plannedDay }, { PLANS }] = await Promise.all([import("@shared/sample/plannedDay"), import("@shared/sample/plans")]);
  const plan = PLANS["park-city-jupiter-to-canyons"];
  const data = await (await fetch(`${API_URL}/mountains/${plan.mountain}.json`)).json();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 1);
  start.setUTCHours(16, 0, 0, 0);
  const { points } = plannedDay(data, { start, seed: Math.floor(Math.random() * 1000), plan: plan.plan, endAt: plan.endAt });
  await addSampleSkiDay(points);
  return "Added a test Park City day to Health. Tap Sync now.";
}
