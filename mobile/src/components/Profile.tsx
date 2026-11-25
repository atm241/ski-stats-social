import type { ReactNode } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import type { ApiProfile } from "@shared/apiTypes";
import { feet } from "@shared/format";
import { Avatar, Card, DayRow, Loading, s, Section, Stat } from "@/components/ui";
import { C, seasonLabel } from "@/lib/theme";
import { useApi } from "@/lib/useApi";

/** A skier's season, lifetime, runs-skied progress per mountain, and days. */
export function ProfileView({ username, footer }: { username: string; footer?: ReactNode }) {
  const { data, error, loading, reload } = useApi<ApiProfile>(`/api/users/${encodeURIComponent(username)}`);
  if (!data) return <Loading error={error} />;
  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={C.accent} />}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16 }}>
        <Avatar user={data.user} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.ink, fontSize: 24, fontWeight: "600" }}>{data.user.displayName}</Text>
          <Text style={{ color: C.inkSoft, fontSize: 13, marginTop: 2 }}>
            @{data.user.username} · {data.followers} followers · {data.followingCount} following
          </Text>
        </View>
      </View>

      <Card style={{ paddingHorizontal: 16, paddingVertical: 6 }}>
        <Text style={{ color: C.inkFaint, fontSize: 10, letterSpacing: 1, marginTop: 8 }}>{seasonLabel(data.season.key)} SEASON</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          <Stat label="Vertical" value={feet(data.season.verticalM)} unit="ft" />
          <Stat label="Days" value={String(data.season.days)} />
          <Stat label="Resorts" value={String(data.season.resorts)} />
        </View>
        <Text style={{ color: C.inkSoft, fontSize: 12, paddingBottom: 10 }}>
          Lifetime {feet(data.lifetime.verticalM)} ft over {data.lifetime.days} days
        </Text>
      </Card>

      {data.completions.length > 0 && (
        <Section title="Runs skied" right={<Text style={{ color: C.inkFaint, fontSize: 12 }}>all seasons</Text>}>
          <Card>
            {data.completions.map((c) => (
              <View key={c.slug} style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: C.line }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                  <Text style={{ color: C.ink, fontSize: 14 }}>{c.name}</Text>
                  <Text style={{ color: C.inkSoft, fontSize: 13, fontVariant: ["tabular-nums"] }}>
                    {c.skied} of {c.total} · {Math.round((c.skied / c.total) * 100)}%
                  </Text>
                </View>
                <View style={{ height: 5, borderRadius: 3, backgroundColor: C.hover, overflow: "hidden" }}>
                  <View style={{ width: `${(c.skied / c.total) * 100}%`, height: "100%", backgroundColor: C.accent, borderRadius: 3 }} />
                </View>
              </View>
            ))}
          </Card>
        </Section>
      )}

      <Section title="Days" right={<Text style={{ color: C.inkFaint, fontSize: 12 }}>{data.days.length}</Text>}>
        <View style={{ borderTopWidth: 0.5, borderTopColor: C.line }}>
          {data.days.map((d) => (
            <DayRow key={d.id} day={d} showUser={false} />
          ))}
        </View>
      </Section>
      {footer}
    </ScrollView>
  );
}
