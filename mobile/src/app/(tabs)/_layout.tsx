import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { C } from "@/lib/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.ink,
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: C.bg, borderTopColor: C.line },
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.inkFaint,
        sceneStyle: { backgroundColor: C.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Feed", tabBarIcon: ({ color, size }) => <Ionicons name="pulse" size={size} color={String(color)} /> }} />
      <Tabs.Screen name="leaderboard" options={{ title: "Leaderboard", tabBarIcon: ({ color, size }) => <Ionicons name="podium" size={size} color={String(color)} /> }} />
      <Tabs.Screen name="you" options={{ title: "You", tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={String(color)} /> }} />
    </Tabs>
  );
}
