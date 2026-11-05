import type { TableSpec } from "@tacazo/core";

/** Bola para la guía: solo posición. */
export interface Punto {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

export interface Guia {
  /** Dónde queda el centro de la blanca al tocar algo. */
  readonly fantasma: { readonly x: number; readonly y: number };
  /** Bola que toca primero, si toca una. */
  readonly bola: number | null;
  /** Dirección en que sale la bola tocada (unitaria). */
  readonly salidaBola: { readonly x: number; readonly y: number } | null;
  /** Dirección aproximada en que sigue la blanca tras tocar la bola (tiro seco). */
  readonly salidaBlanca: { readonly x: number; readonly y: number } | null;
}

/**
 * Traza la línea de apuntado desde la blanca: primera bola que toca o, si no
 * toca ninguna, la banda. Es solo para dibujar; el resultado lo da la física.
 */
export function trazarGuia(
  mesa: TableSpec,
  blanca: { x: number; y: number },
  angulo: number,
  bolas: readonly Punto[],
): Guia {
  const R = mesa.ballRadius;
  const dx = Math.cos(angulo);
  const dy = Math.sin(angulo);
  let mejor = Infinity;
  let bola: Punto | null = null;
  for (const b of bolas) {
    const px = b.x - blanca.x;
    const py = b.y - blanca.y;
    const proy = px * dx + py * dy;
    if (proy <= 0) continue;
    const perp2 = px * px + py * py - proy * proy;
    const r2 = 4 * R * R;
    if (perp2 > r2) continue;
    const t = proy - Math.sqrt(r2 - perp2);
    if (t < mejor) {
      mejor = t;
      bola = b;
    }
  }
  // Banda: el centro de la blanca no pasa de R desde cada borde.
  const limites = [
    dx > 0 ? (mesa.width - R - blanca.x) / dx : dx < 0 ? (R - blanca.x) / dx : Infinity,
    dy > 0 ? (mesa.height - R - blanca.y) / dy : dy < 0 ? (R - blanca.y) / dy : Infinity,
  ];
  const banda = Math.max(0, Math.min(...limites));
  if (!bola || banda < mejor) {
    return {
      fantasma: { x: blanca.x + dx * banda, y: blanca.y + dy * banda },
      bola: null,
      salidaBola: null,
      salidaBlanca: null,
    };
  }
  const fx = blanca.x + dx * mejor;
  const fy = blanca.y + dy * mejor;
  const nx = (bola.x - fx) / (2 * R);
  const ny = (bola.y - fy) / (2 * R);
  // La blanca sale perpendicular a la línea de choque, hacia el lado al que iba.
  const cruz = dx * ny - dy * nx;
  const tx = cruz > 0 ? ny : -ny;
  const ty = cruz > 0 ? -nx : nx;
  const recto = Math.abs(dx * nx + dy * ny) > 0.9999;
  return {
    fantasma: { x: fx, y: fy },
    bola: bola.id,
    salidaBola: { x: nx, y: ny },
    salidaBlanca: recto ? null : { x: tx, y: ty },
  };
}
