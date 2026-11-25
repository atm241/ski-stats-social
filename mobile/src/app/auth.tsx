import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth";

/** Deep link target: gapr://auth?token=pp_… (the end of the emailed sign-in link). */
export default function AuthCallback() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const valid = !!token?.startsWith("pp_");
  const { signIn } = useAuth();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (valid) signIn(token!).finally(() => setDone(true));
  }, [valid, token, signIn]);
  return !valid || done ? <Redirect href="/you" /> : <Loading />;
}
