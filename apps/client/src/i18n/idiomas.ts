/** Idiomas disponibles y cómo se elige el del dispositivo (sin DOM, se prueba solo). */
export const IDIOMAS = [
  { codigo: "es", nombre: "Español", bcp47: "es-CO" },
  { codigo: "en", nombre: "English", bcp47: "en-US" },
  { codigo: "pt", nombre: "Português", bcp47: "pt-BR" },
] as const;

export type Idioma = (typeof IDIOMAS)[number]["codigo"];
export const BASE: Idioma = "es";

export const esIdioma = (x: unknown): x is Idioma => IDIOMAS.some((i) => i.codigo === x);

/** Primer idioma disponible de la lista del navegador (`pt-BR` → `pt`); si no hay, el base. */
export function elegirIdioma(preferidos: readonly string[], guardado: string | null = null): Idioma {
  if (esIdioma(guardado)) return guardado;
  for (const p of preferidos) {
    const c = p.toLowerCase().split("-")[0];
    if (esIdioma(c)) return c;
  }
  return BASE;
}

export const bcp47 = (i: Idioma): string => IDIOMAS.find((x) => x.codigo === i)!.bcp47;
