import Ionicons from "@expo/vector-icons/Ionicons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { ApiDayDetail } from "@shared/apiTypes";
import { duration, feet, miles, mph, prettyDate } from "@shared/format";
import { Avatar, Button, Card, Loading, s, Section, Stat } from "@/components/ui";
import { C, DIFFICULTY_COLOR } from "@/lib/theme";
import { useApi } from "@/lib/useApi";

const COLUMNS = 90;

/** Altitude through the day as thin columns: the day's shape at a glance. */
function AltitudeChart({ profile }: { profile: [number, number][] }) {
  if (profile.length < 2) return null;
  const step = Math.max(1, Math.floor(profile.length / COLUMNS));
  const cols = profile.filter((_, i) => i % step === 0).map((p) => p[1]);
  const lo = Math.min(...cols);
  const hi = Math.max(...cols);
  return (
    <View style={{ height: 90, flexDirection: "row", alignItems: "flex-end", gap: 1, paddingHorizontal: 16 }}>
      {cols.map((e, i) => (
        <View key={i} style={{ flex: 1, height: `${12 + ((e - lo) / Math.max(1, hi - lo)) * 88}%`, backgroundColor: `${C.vert}55`, borderTopLeftRadius: 1, borderTopRightRadius: 1 }} />
      ))}
    </View>
  );
}

export default function DayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, reload } = useApi<ApiDayDetail>(`/api/days/${id}`);
  if (!data) return <Loading error={error} />;
  const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: data.timezone });
  let runNo = 0;

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: data.resortName ?? "Backcountry" }} />
      <Pressable onPress={() => router.push({ pathname: "/u/[username]", params: { username: data.user.username } })} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 12 }}>
          <Avatar user={data.user} size={22} />
          <Text style={{ color: C.inkSoft }}>
            {data.user.displayName} · {prettyDate(data.localDate)}
          </Text>
      </Pressable>

      <Card style={{ marginTop: 14, paddingHorizontal: 16, paddingVertical: 8 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          <Stat label="Vertical" value={feet(data.verticalM)} unit="ft" />
          <Stat label="Runs" value={String(data.runCount)} />
          <Stat label="Top speed" value={mph(data.maxSpeedMps)} unit="mph" />
          <Stat label="Distance" value={miles(data.distanceM)} unit="mi" />
          <Stat label="Ski time" value={duration(data.skiTimeS * 1000)} />
          <Stat label="Peak" value={feet(data.peakEleM)} unit="ft" />
        </View>
      </Card>

      <View style={{ marginTop: 16 }}>
        <AltitudeChart profile={data.profile} />
      </View>

      {data.mountain && (
        <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
          <Button title="▶  Watch the 3D replay" onPress={() => router.push({ pathname: "/replay/[id]", params: { id: data.id } })} />
        </View>
      )}

      {data.skiedWith.length > 0 && (
        <Section title="Skied with">
          <Card>
            {data.skiedWith.map((c) => (
              <Pressable key={c.dayId} onPress={() => router.push({ pathname: "/day/[id]", params: { id: c.dayId } })} style={s.row}>
                  <Avatar user={c.user} size={30} />
                  <Text style={[s.title, { flex: 1 }]}>{c.user.displayName}</Text>
                  <Text style={s.sub}>
                    {c.runs} runs · {c.lifts} lifts together
                  </Text>
              </Pressable>
            ))}
          </Card>
        </Section>
      )}

      <Comments day={data} onChange={reload} />

      <Section title="Timeline">
        <Card>
          {data.timeline.map((t, i) => {
            const isRun = t.kind === "run";
            if (isRun) runNo++;
            return (
              <View key={i} style={[s.row, { paddingVertical: 10 }]}>
                {isRun ? (
                  <View style={{ width: 22, alignItems: "center" }}>
                    <View style={{ width: 9, height: 9, borderRadius: t.difficulty === "intermediate" ? 1 : 5, backgroundColor: DIFFICULTY_COLOR[t.difficulty ?? ""] ?? C.inkFaint }} />
                  </View>
                ) : (
                  <Ionicons name={t.kind === "lift" ? "swap-vertical" : "footsteps"} size={15} color={t.kind === "lift" ? C.lift : C.uphill} style={{ width: 22, textAlign: "center" }} />
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: isRun ? C.ink : C.inkSoft, fontSize: 14 }} numberOfLines={2}>
                    {isRun ? `${runNo}. ` : ""}
                    {t.name ?? (isRun ? "Run" : t.kind === "lift" ? "Lift" : "Climb")}
                  </Text>
                  <Text style={{ color: C.inkFaint, fontSize: 11, marginTop: 2 }}>
                    {clock.format(t.startT)} · {duration(t.endT - t.startT)}
                    {isRun ? ` · top ${mph(t.maxSpeedMps)} mph` : ""}
                  </Text>
                </View>
                <Text style={{ color: isRun ? C.vert : C.inkFaint, fontVariant: ["tabular-nums"] }}>
                  {isRun ? "" : "+"}
                  {feet(t.verticalM)}
                </Text>
                {t.run && data.mountain ? <RunActions run={t.run} mountain={data.mountain} /> : null}
              </View>
            );
          })}
        </Card>
      </Section>
    </ScrollView>
  );
}

type TimelineRun = NonNullable<ApiDayDetail["timeline"][number]["run"]>;

/** Heart (optimistic) and a trophy that opens the trail's leaderboard. */
function RunActions({ run, mountain }: { run: TimelineRun; mountain: string }) {
  const { token } = useAuth();
  const [state, setState] = useState({ liked: run.liked, likes: run.likes });
  const toggle = async () => {
    const next = !state.liked;
    setState((v) => ({ liked: next, likes: v.likes + (next ? 1 : -1) }));
    try {
      const r = await api<{ liked: boolean; likeCount: number }>(`/api/runs/${run.id}/like`, { method: "POST", token, body: JSON.stringify({ like: next }) });
      setState({ liked: r.liked, likes: r.likeCount });
    } catch {
      setState({ liked: run.liked, likes: run.likes });
    }
  };
  return (
    <View style={{ alignItems: "center", gap: 6, marginLeft: 4 }}>
      <Pressable onPress={toggle} disabled={!run.canLike} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
        <Ionicons name={state.liked ? "heart" : "heart-outline"} size={16} color={state.liked ? "#f472b6" : C.inkFaint} />
        {state.likes > 0 && <Text style={{ color: state.liked ? "#f472b6" : C.inkFaint, fontSize: 11 }}>{state.likes}</Text>}
      </Pressable>
      <Pressable onPress={() => router.push({ pathname: "/trail/[mountain]/[trail]", params: { mountain, trail: run.trail } })} hitSlop={8}>
        <Ionicons name="trophy-outline" size={14} color={C.inkFaint} />
      </Pressable>
    </View>
  );
}

function Comments({ day, onChange }: { day: ApiDayDetail; onChange: () => void }) {
  const { token } = useAuth();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const post = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/days/${day.id}/comments`, { method: "POST", token, body: JSON.stringify({ body: text }) });
      setText("");
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    await api(`/api/comments/${id}`, { method: "DELETE", token }).catch(() => null);
    onChange();
  };
  return (
    <Section title="Comments" right={<Text style={{ color: C.inkFaint, fontSize: 12 }}>{day.comments.length || ""}</Text>}>
      <Card style={{ padding: 14, gap: 14 }}>
        {day.comments.map((c) => (
          <View key={c.id} style={{ flexDirection: "row", gap: 10 }}>
            <Avatar user={c.user} size={28} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                <Text style={{ color: C.ink, fontWeight: "500" }}>{c.user.displayName}</Text>
                <Text style={{ color: C.inkFaint, fontSize: 11 }}>{new Date(c.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</Text>
                {c.canDelete && (
                  <Text onPress={() => remove(c.id)} style={{ color: C.inkFaint, fontSize: 11, marginLeft: "auto" }}>
                    Delete
                  </Text>
                )}
              </View>
              <Text style={{ color: C.inkSoft, marginTop: 2 }}>{c.body}</Text>
            </View>
          </View>
        ))}
        {day.canComment ? (
          <View style={{ gap: 8 }}>
            <TextInput value={text} onChangeText={setText} placeholder="Say something about this day…" placeholderTextColor={C.inkFaint} multiline maxLength={500} style={[s.input, { minHeight: 44 }]} />
            {error && <Text style={{ color: C.bad }}>{error}</Text>}
            <Button title={busy ? "Posting…" : "Comment"} onPress={post} disabled={busy || !text.trim()} />
          </View>
        ) : (
          <Text onPress={() => router.push("/sign-in")} style={{ color: C.accent }}>
            Sign in to comment
          </Text>
        )}
      </Card>
    </Section>
  );
}
