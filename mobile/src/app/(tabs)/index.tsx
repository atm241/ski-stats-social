import { FlatList, RefreshControl, Text, View } from "react-native";
import type { ApiFeed } from "@shared/apiTypes";
import { DayRow, Loading, s } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { C } from "@/lib/theme";

/** Your days and the people you follow; everyone's while you follow nobody yet. */
export default function FeedScreen() {
  const { data, error, loading, reload } = useApi<ApiFeed>("/api/feed");
  if (!data) return <Loading error={error} />;
  return (
    <FlatList
      style={s.screen}
      data={data.days}
      keyExtractor={(d) => d.id}
      renderItem={({ item }) => <DayRow day={item} />}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={C.accent} />}
      ListHeaderComponent={
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
          <Text style={{ color: C.inkSoft, fontSize: 13 }}>{data.me ? `Signed in as ${data.me.displayName}` : "Recent days from everyone. Sign in on the You tab to see your crew."}</Text>
        </View>
      }
      ListEmptyComponent={<Text style={{ color: C.inkSoft, padding: 16 }}>No days yet.</Text>}
    />
  );
}
