import { Stack, useLocalSearchParams } from "expo-router";
import { ProfileView } from "@/components/Profile";

export default function UserScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  return (
    <>
      <Stack.Screen options={{ title: `@${username}` }} />
      <ProfileView username={username} />
    </>
  );
}
