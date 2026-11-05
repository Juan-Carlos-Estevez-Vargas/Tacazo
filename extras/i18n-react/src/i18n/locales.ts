/**
 * Idiomas de la app. El español es el idioma base (los textos fuente) y va
 * siempre en el paquete principal; los demás se descargan sólo si alguien
 * los usa. Agregar uno nuevo = una carpeta en messages/ y una fila aquí.
 */
export const LOCALES = [
  { code: "es", tag: "es-CO", ogLocale: "es_CO", name: "Español" },
  { code: "en", tag: "en-US", ogLocale: "en_US", name: "English" },
  { code: "pt", tag: "pt-BR", ogLocale: "pt_BR", name: "Português" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];

export const DEFAULT_LOCALE: Locale = "es";

export const STORAGE_KEY = "app:lang";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.some((l) => l.code === value);
}

export function localeInfo(locale: Locale) {
  return LOCALES.find((l) => l.code === locale) ?? LOCALES[0];
}

/**
 * Elige el idioma a partir de las preferencias del navegador/sistema
 * (navigator.languages, en orden): «pt-BR» → pt, «en-GB» → en. Si ninguno
 * está disponible, español.
 */
export function matchLocale(preferred: readonly string[] | undefined): Locale {
  for (const raw of preferred ?? []) {
    const base = raw.trim().toLowerCase().split(/[-_]/)[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
