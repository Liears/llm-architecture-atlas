import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/src/**/*.test.ts", "tools/**/*.test.ts", "apps/web/e2e/**/*.test.ts"],
  },
});
