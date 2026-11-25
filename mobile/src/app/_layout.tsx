import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/lib/auth";
import { C } from "@/lib/theme";

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: C.bg },
          headerTintColor: C.ink,
          headerTitleStyle: { fontWeight: "600" },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: C.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="day/[id]" options={{ title: "Day" }} />
        <Stack.Screen name="u/[username]" options={{ title: "" }} />
        <Stack.Screen name="replay/[id]" options={{ title: "3D replay", headerTransparent: false }} />
        <Stack.Screen name="trail/[mountain]/[trail]" options={{ title: "Trail" }} />
        <Stack.Screen name="people" options={{ title: "Find friends" }} />
        <Stack.Screen name="sign-in" options={{ title: "Sign in", presentation: "modal" }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
  );
}
