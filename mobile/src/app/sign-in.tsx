import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Button, s } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { C } from "@/lib/theme";

const DEMO = ["dana", "priya", "alex", "kai"];

/**
 * Email sign-in: the server emails a link; opening it on the phone ends in gapr://auth?token=…,
 * which the auth route stores. In development (no email provider) the server hands the link back.
 */
export default function SignInScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<{ to: string; devLink?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ sentTo: string; devLink?: string }>("/api/auth/link", { method: "POST", body: JSON.stringify({ email }) });
      setSent({ to: r.sentTo, devLink: r.devLink });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const demo = async (username: string) => {
    try {
      const { token } = await api<{ token: string }>("/api/auth/dev", { method: "POST", body: JSON.stringify({ username }) });
      await signIn(token);
      router.dismissTo("/you");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
        {!sent ? (
          <>
            <Text style={{ color: C.inkSoft }}>We&apos;ll email you a link. Open it on this phone and you&apos;re in, no password.</Text>
            <TextInput value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={C.inkFaint} keyboardType="email-address" autoCapitalize="none" autoComplete="email" style={s.input} />
            <Button title={busy ? "Sending…" : "Email me a link"} onPress={send} disabled={busy || !email.includes("@")} />
          </>
        ) : (
          <>
            <Text style={{ color: C.ink, fontSize: 18, fontWeight: "600" }}>Check {sent.to}</Text>
            <Text style={{ color: C.inkSoft }}>Tap the link in the email on this phone. It expires in 15 minutes.</Text>
            {sent.devLink && <Button title="Open the link (dev)" kind="ghost" onPress={() => Linking.openURL(sent.devLink!)} />}
          </>
        )}
        {error && <Text style={{ color: C.bad }}>{error}</Text>}

        {__DEV__ && (
          <View style={{ marginTop: 20, gap: 8 }}>
            <Text style={{ color: C.inkFaint, fontSize: 12 }}>DEV: SIGN IN AS A DEMO SKIER</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {DEMO.map((u) => (
                <Pressable key={u} onPress={() => demo(u)} style={[s.chip, { backgroundColor: C.raised, borderWidth: 1, borderColor: C.lineStrong }]}>
                  <Text style={{ color: C.ink }}>{u}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
