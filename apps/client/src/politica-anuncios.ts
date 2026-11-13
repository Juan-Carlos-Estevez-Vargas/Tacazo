/**
 * Reglas de los anuncios, sin tocar el DOM (así se prueban solas):
 *
 * - Nada se carga sin consentimiento.
 * - Personalizados solo si la persona los acepta y no dijo ser menor de edad.
 * - Solo en menús (sala de espera y resultados). Nunca en la mesa.
 */

export interface Consentimiento {
  /** Aceptó anuncios según sus intereses. */
  readonly personalizados: boolean;
  /** Dijo ser menor de 18 años: siempre no personalizados. */
  readonly menor: boolean;
  /** Versión del texto que aceptó; si cambia, se vuelve a preguntar. */
  readonly version: number;
}

export const VERSION_CONSENTIMIENTO = 1;
export type Lugar = "menu" | "mesa";

export function leerConsentimiento(texto: string | null): Consentimiento | null {
  if (!texto) return null;
  try {
    const c = JSON.parse(texto) as Partial<Consentimiento>;
    if (typeof c.personalizados !== "boolean" || typeof c.menor !== "boolean") return null;
    if (c.version !== VERSION_CONSENTIMIENTO) return null;
    return { personalizados: c.personalizados, menor: c.menor, version: c.version };
  } catch {
    return null;
  }
}

export const soloNoPersonalizados = (c: Consentimiento): boolean => !c.personalizados || c.menor;

/** ¿Se puede mostrar la tarjeta en este lugar? */
export function mostrarTarjeta(
  lugar: Lugar,
  c: Consentimiento | null,
  configurado: boolean,
  cerrada: boolean,
): boolean {
  return lugar === "menu" && configurado && c !== null && !cerrada;
}
