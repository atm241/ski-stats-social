import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import type { ApiLeaderboard, ApiLeaderboardRow } from "@shared/apiTypes";
import { feet } from "@shared/format";
import { Avatar, Loading, s } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { C, seasonLabel } from "@/lib/theme";
import { useApi } from "@/lib/useApi";

const METRICS = [
  { key: "vertical", label: "Vertical" },
  { key: "days", label: "Days" },
  { key: "resorts", label: "Resorts" },
  { key: "bestday", label: "Best day" },
  { key: "uphill", label: "Uphill" },
] as const;
type Row = ApiLeaderboardRow;
const VALUE: Record<string, (r: Row) => string> = {
  vertical: (r) => `${feet(r.verticalM)} ft`,
  days: (r) => `${r.days} days`,
  resorts: (r) => `${r.resorts}`,
  bestday: (r) => `${feet(r.bestDayM)} ft`,
  uphill: (r) => `${feet(r.uphillM)} ft`,
};

function Chip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, { backgroundColor: active ? C.hover : "transparent" }]}>
      <Text style={{ color: active ? C.ink : C.inkSoft, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export default function LeaderboardScreen() {
  const { me } = useAuth();
  const [metric, setMetric] = useState("vertical");
  const [scope, setScope] = useState<"public" | "friends">("public");
  const [season, setSeason] = useState<string | null>(null);
  const { data, error, loading, reload } = useApi<ApiLeaderboard>(`/api/leaderboard?metric=${metric}&scope=${scope}${season ? `&season=${season}` : ""}`);

  return (
    <View style={s.screen}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 4 }}>
        {METRICS.map((m) => (
          <Chip key={m.key} active={m.key === metric} label={m.label} onPress={() => setMetric(m.key)} />
        ))}
      </ScrollView>
      <View style={{ flexDirection: "row", paddingHorizontal: 12, gap: 4, alignItems: "center" }}>
        <Chip active={scope === "public"} label="Public" onPress={() => setScope("public")} />
        {me && <Chip active={scope === "friends"} label="Friends" onPress={() => setScope("friends")} />}
        <View style={{ flex: 1 }} />
        {data?.seasons.map((k) => <Chip key={k} active={k === data.season} label={seasonLabel(k)} onPress={() => setSeason(k)} />)}
      </View>
      {!data ? (
        <Loading error={error} />
      ) : (
        <FlatList
          data={data.rows}
          keyExtractor={(r) => r.user.username}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={C.accent} />}
          renderItem={({ item }) => <BoardRow row={item} metric={metric} isMe={item.user.username === me?.username} />}
          ListFooterComponent={
            data.mine && !data.rows.some((r) => r.user.username === data.mine!.user.username) ? (
              <>
                <Text style={{ color: C.inkFaint, textAlign: "center", paddingVertical: 4 }}>···</Text>
                <BoardRow row={data.mine} metric={metric} isMe />
              </>
            ) : undefined
          }
          ListEmptyComponent={<Text style={{ color: C.inkSoft, padding: 16 }}>{scope === "friends" ? "No friends here yet. Friends are people you follow who follow you back." : "Nobody on the board this season yet."}</Text>}
        />
      )}
    </View>
  );
}

function BoardRow({ row, metric, isMe }: { row: Row; metric: string; isMe: boolean }) {
  return (
    <Pressable onPress={() => router.push({ pathname: "/u/[username]", params: { username: row.user.username } })} style={({ pressed }) => [s.row, (pressed || isMe) && { backgroundColor: C.raised }]}>
      <Text style={{ width: 28, textAlign: "right", color: row.rank <= 3 ? C.accent : C.inkFaint, fontVariant: ["tabular-nums"] }}>{row.rank}</Text>
      <Avatar user={row.user} size={32} />
      <Text style={[s.title, { flex: 1 }]} numberOfLines={1}>
        {row.user.displayName}
        {isMe ? "  (you)" : ""}
      </Text>
      <Text style={[s.vert, { color: C.ink }]}>{VALUE[metric](row)}</Text>
    </Pressable>
  );
}
