import { defineConfig } from "@playwright/test";

const hasAppEnvironment = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    (process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY),
);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  reporter: "list",
  outputDir: "/tmp/my-qr-platform-playwright",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  webServer: hasAppEnvironment
    ? {
        command: "npm run dev",
        reuseExistingServer: true,
        timeout: 120_000,
        url: "http://127.0.0.1:3000/login",
      }
    : undefined,
});
