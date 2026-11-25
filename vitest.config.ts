import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Database tests run against their own Postgres database (`gapr_test`, created by `npm run db:up`). */
const TEST_DATABASE_URL = (process.env.TEST_DATABASE_URL ??= "postgresql://gapr:gapr@localhost:5434/gapr_test");

export default defineConfig({
  resolve: {
    alias: {
      // Tests run server code outside Next.js, where the `server-only` guard would throw on import.
      "server-only": fileURLToPath(new URL("./src/lib/test/empty.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    projects: [
      { extends: true, test: { name: "unit", include: ["src/**/*.test.ts"], exclude: ["src/**/*.db.test.ts"] } },
      {
        extends: true,
        test: {
          name: "db",
          include: ["src/**/*.db.test.ts"],
          env: { DATABASE_URL: TEST_DATABASE_URL },
          globalSetup: ["src/lib/test/dbSetup.ts"],
          fileParallelism: false, // one database, so one file at a time
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
