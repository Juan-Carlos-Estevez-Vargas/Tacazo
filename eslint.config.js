import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "extras/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
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
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "NewExpression[callee.name='Date']", message: "El motor no lee el reloj." },
      ],
    },
  },
);
