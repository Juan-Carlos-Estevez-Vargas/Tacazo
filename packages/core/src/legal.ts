/**
 * Versiones vigentes de los textos legales. Al cambiar un texto en
 * `apps/client/public/legal/` se sube su fecha aquí: el cliente vuelve a
 * pedir la aceptación y la API rechaza versiones viejas.
 */
export const LEGAL = {
  terminos: "2026-11-13",
  privacidad: "2026-11-13",
} as const;

/** Edad mínima para tener jugador con datos guardados. */
export const EDAD_MINIMA = 14;

/** Rangos de edad que se piden (solo el rango, no la fecha de nacimiento). */
export const EDADES = ["14-17", "18+"] as const;
export type Edad = (typeof EDADES)[number];
