import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "extras/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    // Tiros dorados: corren en Node.
    files: ["packages/core/test/**/*.ts"],
    languageOptions: { globals: { process: "readonly" } },
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
  {
    // Scripts de la plantilla y archivos de configuración: corren en Node.
    files: ["scripts/**/*.mjs", "*.config.{js,ts}"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly", Buffer: "readonly", URL: "readonly" },
    },
  },
  {
    // El motor debe ser determinista y correr igual en cliente, servidor y bot.
    files: ["packages/core/src/**/*.ts"],
    rules: {
      // Con noUncheckedIndexedAccess, los bucles de física indexan arreglos con `!`.
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-restricted-globals": [
        "error",
        "window",
        "document",
        "navigator",
        "performance",
        "requestAnimationFrame",
      ],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Usa el generador con semilla del motor." },
        { object: "Date", property: "now", message: "El motor no lee el reloj." },
        ...["sin", "cos", "tan", "asin", "acos", "atan", "atan2", "hypot", "exp", "log", "pow", "cbrt"].map(
          (property) => ({
            object: "Math",
            property,
            message:
              "No da el mismo bit en todos los navegadores. Usa dmath.ts (dsin, dcos, dln) o Math.sqrt.",
          }),
        ),
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "NewExpression[callee.name='Date']", message: "El motor no lee el reloj." },
      ],
    },
  },
  {
    // Las pruebas del motor pueden comparar contra Math.sin y compañía.
    files: ["packages/core/src/**/*.test.ts"],
    rules: { "no-restricted-properties": "off" },
  },
);
