import { defineConfig, devices } from "@playwright/test";

// Smoke suite for issue #1: the static site builds and serves.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.ATLAS_BASE_URL ?? "http://127.0.0.1:4321",
    trace: "retain-on-failure",
  },
  webServer: process.env.ATLAS_BASE_URL
    ? undefined
    : {
        command: "pnpm preview --port 4321 --strictPort",
        url: "http://127.0.0.1:4321/llm-architecture-atlas/",
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
