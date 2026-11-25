import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Tests run server code outside Next.js, where the `server-only` guard would throw on import.
      "server-only": fileURLToPath(new URL("./src/lib/test/empty.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: { exclude: ["node_modules/**", "mobile/**", ".next/**"] },
});
