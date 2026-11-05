/**
 * Internacionalización sin dependencias.
 *
 * Los textos viven en diccionarios tipados (messages/<idioma>): el español es
 * la fuente y define el tipo `Messages`, así que TypeScript exige que cada
 * traducción tenga exactamente las mismas claves y las mismas funciones
 * (para textos con variables o plurales).
 *
 *   const t = useT();          // en componentes: se re-renderiza al cambiar
 *   t.auth.login.title
 *   t.common.unread(3)
 *
 *   msg().errors.network        // fuera de React (dominio, servicios)
 *
 * Al arrancar se usa el idioma guardado o, si no hay, el del navegador/PC.
 * Se recuerda en localStorage y se refleja en <html lang>.
 */
import { useSyncExternalStore } from "react";
import { getLocale, msg, subscribe, type Locale, type Messages } from "./store";

export * from "./store";

/** Textos del idioma activo; el componente se vuelve a pintar al cambiarlo. */
export function useT(): Messages {
  return useSyncExternalStore(subscribe, msg, msg);
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, getLocale);
}

