import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Share, Text, TextInput, View } from "react-native";
import type { ApiPeople, ApiUser } from "@shared/apiTypes";
import { Avatar, Button, Card, Loading, s, Section } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { C } from "@/lib/theme";
import { useApi } from "@/lib/useApi";

/** Search skiers, people you may know, and sharing your invite link. */
export default function PeopleScreen() {
  const [q, setQ] = useState("");
  const { data, error } = useApi<ApiPeople>(`/api/people?q=${encodeURIComponent(q.trim())}`);
  if (!data) return <Loading error={error} />;
  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View style={{ padding: 16, gap: 10 }}>
        <Text style={{ color: C.inkSoft, fontSize: 13 }}>Friends are people you follow who follow you back.</Text>
        <TextInput value={q} onChangeText={setQ} placeholder="Search by name or @username" placeholderTextColor={C.inkFaint} autoCapitalize="none" autoCorrect={false} style={s.input} />
      </View>
      {q.trim().length >= 2 && (
        <Section title="Results">
          <Card>
            {data.results.map((u) => (
              <PersonRow key={u.username} user={u} following={u.following} note={u.friend ? "friend" : undefined} />
            ))}
            {!data.results.length && <Text style={{ color: C.inkSoft, padding: 14 }}>Nobody by that name yet. Send them your invite link.</Text>}
          </Card>
        </Section>
      )}
      {data.inviteUrl && (
        <Section title="Your invite link">
          <View style={{ paddingHorizontal: 16, gap: 8 }}>
            <Text style={{ color: C.inkSoft, fontSize: 13 }}>Anyone who opens it and signs in can add you as a friend in one tap.</Text>
            <Button title="Share invite link" onPress={() => Share.share({ message: `Ski with me on Gapr: ${data.inviteUrl}`, url: data.inviteUrl! })} />
          </View>
        </Section>
      )}
      {data.suggestions.length > 0 && (
        <Section title="People you may know">
          <Card>
            {data.suggestions.map((u) => (
              <PersonRow key={u.username} user={u} following={u.following} note={u.reason} />
            ))}
          </Card>
        </Section>
      )}
    </ScrollView>
  );
}

function PersonRow({ user, following, note }: { user: ApiUser; following: boolean; note?: string }) {
  const { token } = useAuth();
  const [on, setOn] = useState(following);
  const toggle = async () => {
    setOn(!on);
    await api("/api/follows", { method: "POST", token, body: JSON.stringify({ username: user.username, follow: !on }) }).catch(() => setOn(on));
  };
  return (
    <View style={s.row}>
      <Pressable onPress={() => router.push({ pathname: "/u/[username]", params: { username: user.username } })} style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
        <Avatar user={user} size={34} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title} numberOfLines={1}>
            {user.displayName}
          </Text>
          <Text style={s.sub} numberOfLines={1}>
            @{user.username}
            {note ? ` · ${note}` : ""}
          </Text>
        </View>
      </Pressable>
      {token && (
        <Pressable onPress={toggle} style={[s.chip, { backgroundColor: on ? C.raised : C.accent, borderWidth: on ? 1 : 0, borderColor: C.lineStrong }]}>
          <Text style={{ color: on ? C.ink : C.bg, fontWeight: "600" }}>{on ? "Following" : "Follow"}</Text>
        </Pressable>
      )}
    </View>
  );
}
