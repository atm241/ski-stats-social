import { execSync } from "node:child_process";

/** Before the db suite (TEST_DATABASE_URL is set in vitest.config.ts): bring the test database up to the latest migration (tests empty it themselves). */
export default function setup() {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL }, stdio: "pipe" });
}
