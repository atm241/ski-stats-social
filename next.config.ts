import type { NextConfig } from "next";

/** Baseline hardening for every response. A full script CSP would need per-request nonces; this covers clickjacking, MIME sniffing and referrer leaks. */
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }, // ignored over plain http (local dev)
];

/**
 * Dev only: lets the Expo app running in a browser (localhost:8081) call the JSON API. Native apps
 * don't need CORS. The API authenticates with Bearer tokens, and cross-origin requests carry no cookies.
 */
const DEV_API_CORS = [
  { key: "Access-Control-Allow-Origin", value: "*" },
  { key: "Access-Control-Allow-Methods", value: "GET, POST, DELETE, OPTIONS" },
  { key: "Access-Control-Allow-Headers", value: "Authorization, Content-Type" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  headers: async () => [
    { source: "/:path*", headers: SECURITY_HEADERS },
    ...(process.env.NODE_ENV === "production" ? [] : [{ source: "/api/:path*", headers: DEV_API_CORS }]),
  ],
};

export default nextConfig;
