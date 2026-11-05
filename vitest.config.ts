import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "packages/*/test/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    coverage: { provider: "v8", include: ["packages/core/src/**"], thresholds: { lines: 70 } },
  },
});
