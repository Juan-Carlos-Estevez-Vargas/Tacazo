/**
 * Tokens de la marca Tacazo. Fuente: kit de marca (docs/MARCA.md).
 * El juego y los menús toman los colores y las fuentes de aquí.
 */
export const COLORES = {
  pano: "#0E5A45",
  panoOscuro: "#1D8A68",
  tiza: "#2C6BD8",
  tizaOscuro: "#6C9CF0",
  laton: "#C08A2B",
  latonOscuro: "#E0A845",
  marfil: "#F7F5EE",
  noche: "#0B1512",
} as const;

export const FUENTES = {
  titulos: '"Anybody", "Arial Black", system-ui, sans-serif',
  textos: '"Atkinson Hyperlegible", system-ui, sans-serif',
  numeros: '"JetBrains Mono", ui-monospace, monospace',
} as const;

/** Bolas de pool del 1 al 15 (8 = negra; 9 a 15 rayadas con el color de 1 a 7). */
export const BOLAS_POOL = [
  "#e3b505",
  "#1f4fbf",
  "#d1342f",
  "#6b3fa0",
  "#ec7a1c",
  "#1d8a4e",
  "#7a2e1d",
  "#111111",
] as const;
