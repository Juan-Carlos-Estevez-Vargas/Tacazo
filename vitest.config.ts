import { defineConfig } from "vitest/config";

const raiz = (p: string) => new URL(p, import.meta.url).pathname;

export default defineConfig({
  // Las pruebas usan el código fuente de los paquetes, no el compilado en dist/.
  resolve: {
    alias: [
      { find: "@tacazo/core", replacement: raiz("./packages/core/src/index.ts") },
      { find: /^@tacazo\/api\/(.*)$/, replacement: raiz("./apps/api/src/$1.ts") },
    ],
  },
  test: {
    include: ["packages/*/src/**/*.test.ts", "packages/*/test/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    coverage: { provider: "v8", include: ["packages/core/src/**"], thresholds: { lines: 70 } },
  },
});
