import { defineConfig } from "vitest/config";

export default defineConfig({
  // Las pruebas usan el código fuente del motor, no el compilado en dist/.
  resolve: { alias: { "@tacazo/core": new URL("./packages/core/src/index.ts", import.meta.url).pathname } },
  test: {
    include: ["packages/*/src/**/*.test.ts", "packages/*/test/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    coverage: { provider: "v8", include: ["packages/core/src/**"], thresholds: { lines: 70 } },
  },
});
