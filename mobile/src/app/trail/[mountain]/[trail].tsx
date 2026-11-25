import Ionicons from "@expo/vector-icons/Ionicons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { ApiTrailBoard } from "@shared/apiTypes";
import { mph, prettyDate } from "@shared/format";
import { Avatar, Card, Loading, s, Section } from "@/components/ui";
import { C } from "@/lib/theme";
import { useApi } from "@/lib/useApi";

/** One trail's leaderboards: fastest down it (best per skier) and the most-liked runs down it. */
export default function TrailBoardScreen() {
  const { mountain, trail } = useLocalSearchParams<{ mountain: string; trail: string }>();
  const { data, error } = useApi<ApiTrailBoard>(`/api/mountains/${mountain}/trails/${encodeURIComponent(trail)}`);
  if (!data) return <Loading error={error} />;
  const row = (key: string, i: number, user: ApiTrailBoard["fastest"][number]["user"], dayId: string, date: string, right: ReactNode) => (
    <Pressable key={key} onPress={() => router.push({ pathname: "/day/[id]", params: { id: dayId } })} style={({ pressed }) => [s.row, pressed && { backgroundColor: C.raised }]}>
      <Text style={{ width: 20, textAlign: "right", color: i < 3 ? C.accent : C.inkFaint, fontVariant: ["tabular-nums"] }}>{i + 1}</Text>
      <Avatar user={user} size={28} />
      <Text style={[s.title, { flex: 1 }]} numberOfLines={1}>
        {user.displayName}
      </Text>
      <Text style={{ color: C.inkFaint, fontSize: 12 }}>{prettyDate(date, { month: "short", day: "numeric" })}</Text>
      {right}
    </Pressable>
  );
  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: data.trail }} />
      <Text style={{ color: C.inkSoft, paddingHorizontal: 16, paddingTop: 12 }}>
        {data.totalRuns} {data.totalRuns === 1 ? "run" : "runs"} logged down {data.trail}
      </Text>
      <Section title="Fastest" right={<Text style={{ color: C.inkFaint, fontSize: 12 }}>top speed on this trail</Text>}>
        <Card>
          {data.fastest.map((r, i) => row(`f${r.dayId}${i}`, i, r.user, r.dayId, r.localDate, <Text style={{ color: C.ink, width: 64, textAlign: "right", fontVariant: ["tabular-nums"] }}>{mph(r.maxSpeedMps)} mph</Text>))}
          {!data.fastest.length && <Text style={{ color: C.inkSoft, padding: 14 }}>No clean runs yet.</Text>}
        </Card>
      </Section>
      <Section title="Most liked">
        <Card>
          {data.liked.map((r, i) =>
            row(
              `l${r.dayId}${i}`,
              i,
              r.user,
              r.dayId,
              r.localDate,
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3, width: 44, justifyContent: "flex-end" }}>
                <Ionicons name="heart" size={12} color="#f472b6" />
                <Text style={{ color: "#f472b6", fontVariant: ["tabular-nums"] }}>{r.likes}</Text>
              </View>,
            ),
          )}
          {!data.liked.length && <Text style={{ color: C.inkSoft, padding: 14 }}>No likes yet. Like a run from its day.</Text>}
        </Card>
      </Section>
    </ScrollView>
  );
}
