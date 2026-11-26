import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import type { ApiUser } from "@shared/apiTypes";
import { api, ApiError, tokenStore } from "./api";

type Me = Pick<ApiUser, "username" | "displayName">;
interface Auth {
  ready: boolean;
  token: string | null;
  me: Me | null;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<Auth | null>(null);

/** Holds the API token and who it belongs to; a revoked token signs you out. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);

  const load = useCallback(async (t: string | null) => {
    if (!t) {
      setToken(null);
      setMe(null);
      return;
    }
    try {
      setMe(await api<Me>("/api/me", { token: t }));
      setToken(t);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) await tokenStore.clear();
      setToken(null);
      setMe(null);
    }
  }, []);

  useEffect(() => {
    tokenStore
      .get()
      .then(load)
      .finally(() => setReady(true));
  }, [load]);

  const signIn = useCallback(
    async (t: string) => {
      await tokenStore.set(t);
      await load(t);
    },
    [load],
  );
  const signOut = useCallback(async () => {
    const t = await tokenStore.get();
    if (t) await api("/api/auth/sign-out", { method: "POST", token: t }).catch(() => {}); // revoke it server-side too
    await tokenStore.clear();
    await load(null);
  }, [load]);

  return <AuthContext.Provider value={{ ready, token, me, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
