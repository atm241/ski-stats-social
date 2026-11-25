import * as Linking from "expo-linking";
import { useLocalSearchParams } from "expo-router";
import { Platform, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { Button, s } from "@/components/ui";
import { API_URL } from "@/lib/api";
import { C } from "@/lib/theme";

/**
 * The 3D replay is the web's three.js scene, shown chrome-free (?embed=1). Same renderer on every
 * platform; a native renderer (expo-gl) can replace this later without changing the API.
 */
export default function ReplayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const url = `${API_URL}/days/${id}/replay?embed=1`;
  if (Platform.OS === "web")
    return (
      <View style={[s.center, { gap: 12 }]}>
        <Text style={{ color: C.inkSoft }}>The replay opens in the browser here.</Text>
        <Button title="Open 3D replay" onPress={() => Linking.openURL(url)} />
      </View>
    );
  return <WebView source={{ uri: url }} style={{ flex: 1, backgroundColor: C.bg }} allowsInlineMediaPlayback originWhitelist={["*"]} />;
}
