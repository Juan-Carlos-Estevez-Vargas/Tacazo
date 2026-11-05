# Base de idiomas para React + TypeScript

Internacionalización sin dependencias, lista para copiar en `src/`. La guía y
sus reglas están en [docs/IDIOMAS.md](../../docs/IDIOMAS.md).

## Cómo usarla

1. Copia `src/i18n/` y `src/app/LanguagePicker.tsx` a tu proyecto. El alias
   `@/` debe apuntar a `src/`.
2. En `main.tsx`, ejecuta `await initI18n()` antes de `render`.
3. Pon `<LanguagePicker compact />` en la cabecera y `<LanguagePicker />` en el
   pie o en la cuenta. Ajusta los estilos de `_language.scss` a tus tokens.
4. Reemplaza los textos por `useT()` en componentes y por `msg()` fuera de
   React (importando desde `@/i18n/store`).
5. Si no usas español, inglés y portugués, edita `LOCALES` en `locales.ts` y
   los cargadores en `store.ts`. El idioma base es el que define el tipo.
6. Borra esta carpeta `extras/` cuando ya no la necesites.

Requiere React 18 o superior (`useSyncExternalStore`) y, para las pruebas,
Vitest.
