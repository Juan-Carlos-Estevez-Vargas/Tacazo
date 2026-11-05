/**
 * Estado del idioma sin React: lo usan el dominio, los servicios y el manejo de errores.
 * Los componentes usan los hooks de `./index` (useT, useLocale).
 */
import es from "./messages/es";
import { DEFAULT_LOCALE, STORAGE_KEY, isLocale, localeInfo, matchLocale, type Locale } from "./locales";

export type Messages = typeof es;
export { LOCALES, type Locale } from "./locales";

const loaders: Record<Exclude<Locale, "es">, () => Promise<{ default: Messages }>> = {
  en: () => import("./messages/en"),
  pt: () => import("./messages/pt"),
};

const loaded: Partial<Record<Locale, Messages>> = { es };
let locale: Locale = DEFAULT_LOCALE;
let messages: Messages = es;
const listeners = new Set<() => void>();

function readStored(): Locale | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

/** Idioma con el que arranca la app: el elegido antes o el del sistema. */
export function initialLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  return readStored() ?? matchLocale(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

async function load(next: Locale): Promise<Messages> {
  const cached = loaded[next];
  if (cached) return cached;
  const mod = await loaders[next as Exclude<Locale, "es">]();
  loaded[next] = mod.default;
  return mod.default;
}

function apply(next: Locale, dict: Messages) {
  locale = next;
  messages = dict;
  if (typeof document !== "undefined") document.documentElement.lang = localeInfo(next).tag;
  listeners.forEach((listener) => listener());
}

/** Cambia el idioma (descargando su diccionario si hace falta) y lo recuerda. */
export async function setLocale(next: Locale, { remember = true } = {}): Promise<void> {
  let dict: Messages;
  try {
    dict = await load(next);
  } catch (error) {
    console.warn("[i18n]", error);
    return;
  }
  if (remember) {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Almacenamiento bloqueado: el idioma dura hasta recargar.
    }
  }
  apply(next, dict);
}

/** Prepara el idioma inicial antes de pintar la app (no lo guarda: se sigue al sistema). */
export function initI18n(): Promise<void> {
  const start = initialLocale();
  if (start === DEFAULT_LOCALE) {
    apply(start, es);
    return Promise.resolve();
  }
  return setLocale(start, { remember: false });
}

/** Diccionario activo, para código fuera de React. */
export function msg(): Messages {
  return messages;
}

export function getLocale(): Locale {
  return locale;
}

/** Etiqueta BCP 47 para Intl (es-CO, en-US, pt-BR). */
export function intlTag(): string {
  return localeInfo(locale).tag;
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Avisa cuando cambia el idioma (para formateadores en caché, etc.). */
export function onLocaleChange(listener: () => void): () => void {
  return subscribe(listener) as () => void;
}

const formatCache = new Map<string, Intl.DateTimeFormat>();

/** Intl.DateTimeFormat del idioma activo, reutilizado entre llamadas. */
export function dateFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let fmt = formatCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(intlTag(), options);
    formatCache.set(key, fmt);
  }
  return fmt;
}

export function formatNumber(value: number): string {
  return value.toLocaleString(intlTag());
}

const relativeCache = new Map<string, Intl.RelativeTimeFormat>();

export function relativeFormat(): Intl.RelativeTimeFormat {
  let fmt = relativeCache.get(locale);
  if (!fmt) {
    fmt = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    relativeCache.set(locale, fmt);
  }
  return fmt;
}
