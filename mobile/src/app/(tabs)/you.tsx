import { router } from "expo-router";
import { useState } from "react";
import { Alert, Platform, Text, TextInput, View } from "react-native";
import { ProfileView } from "@/components/Profile";
import { Button, Loading, s, Section } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { C } from "@/lib/theme";

export default function YouScreen() {
  const { ready, me } = useAuth();
  if (!ready) return <Loading />;
  if (!me)
    return (
      <View style={[s.center, { gap: 14 }]}>
        <Text style={{ color: C.ink, fontSize: 22, fontWeight: "600" }}>Gapr</Text>
        <Text style={{ color: C.inkSoft, textAlign: "center", maxWidth: 300 }}>Sign in to see your days, your crew&apos;s, and where you stand.</Text>
        <Button title="Sign in" onPress={() => router.push("/sign-in")} />
      </View>
    );
  return <ProfileView username={me.username} footer={<AccountActions username={me.username} />} />;
}

function AccountActions({ username }: { username: string }) {
  const { token, signOut } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destroy = async () => {
    setBusy(true);
    try {
      await api("/api/me", { method: "DELETE", token, body: JSON.stringify({ confirm: typed }) });
      await signOut();
      if (Platform.OS !== "web") Alert.alert("Account deleted", "Your account and all your days were deleted.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Account">
      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        <Button title="Find friends" onPress={() => router.push("/people")} />
        <Button title="Sign out" kind="ghost" onPress={signOut} />
        {!deleting ? (
          <Text onPress={() => setDeleting(true)} style={{ color: C.bad, textAlign: "center", paddingVertical: 10 }}>
            Delete my account
          </Text>
        ) : (
          <View style={{ gap: 10, borderWidth: 1, borderColor: `${C.bad}66`, borderRadius: 12, padding: 14 }}>
            <Text style={{ color: C.ink }}>This permanently deletes @{username}, every day and GPS track, your follows and sync tokens. It can&apos;t be undone.</Text>
            <TextInput value={typed} onChangeText={setTyped} placeholder={`Type ${username} to confirm`} placeholderTextColor={C.inkFaint} autoCapitalize="none" autoCorrect={false} style={s.input} />
            {error && <Text style={{ color: C.bad }}>{error}</Text>}
            <Button title={busy ? "Deleting…" : "Delete forever"} onPress={destroy} disabled={busy || typed.trim().toLowerCase() !== username} />
            <Text onPress={() => (setDeleting(false), setTyped(""))} style={{ color: C.inkSoft, textAlign: "center", paddingVertical: 6 }}>
              Cancel
            </Text>
          </View>
        )}
      </View>
    </Section>
  );
}
