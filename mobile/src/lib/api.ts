import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Talks to the Gapr web app's JSON API with a personal API token (the same kind the web's
 * Settings → iPhone sync issues). Set EXPO_PUBLIC_API_URL for a deployed server; the iOS simulator
 * reaches the Mac's localhost directly.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3100").replace(/\/$/, "");

const TOKEN_KEY = "gapr.token";

// The keychain on phones; localStorage only when the app runs in a browser for testing.
export const tokenStore = {
  get: async () => (Platform.OS === "web" ? globalThis.localStorage?.getItem(TOKEN_KEY) ?? null : SecureStore.getItemAsync(TOKEN_KEY)),
  set: async (token: string) => (Platform.OS === "web" ? globalThis.localStorage?.setItem(TOKEN_KEY, token) : SecureStore.setItemAsync(TOKEN_KEY, token)),
  clear: async () => (Platform.OS === "web" ? globalThis.localStorage?.removeItem(TOKEN_KEY) : SecureStore.deleteItemAsync(TOKEN_KEY)),
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { token?: string | null } = {}): Promise<T> {
  const { token, ...rest } = init;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: { ...(rest.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...rest.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((body as { error?: string }).error ?? `Request failed (${res.status})`, res.status);
  return body as T;
}
