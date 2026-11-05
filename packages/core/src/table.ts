import { vec, type Vec2 } from "./vec.js";

/**
 * Una mesa se describe como datos: el motor no sabe si es pool, carambola o
 * snooker. Un modo nuevo es una mesa + un juego de bolas + sus reglas.
 * Todas las medidas en metros, con el origen en la esquina inferior izquierda
 * del área de juego.
 */
export interface TableSpec {
  readonly id: string;
  /** Área de juego entre las gomas de las bandas. */
  readonly width: number;
  readonly height: number;
  /** Radio de las bolas de esta mesa. */
  readonly ballRadius: number;
  readonly pockets: readonly Pocket[];
}

export interface Pocket {
  readonly center: Vec2;
  /** Radio de captura: si el centro de la bola entra aquí, cae. */
  readonly radius: number;
}

/** Mesa de pool de 9 pies (área de juego 2,54 × 1,27 m), bolas de 57,2 mm. */
export const POOL_9FT: TableSpec = (() => {
  const width = 2.54;
  const height = 1.27;
  const corner = 0.06;
  const side = 0.065;
  return {
    id: "pool-9ft",
    width,
    height,
    ballRadius: 0.05715 / 2,
    pockets: [
      { center: vec(0, 0), radius: corner },
      { center: vec(width / 2, -0.01), radius: side },
      { center: vec(width, 0), radius: corner },
      { center: vec(0, height), radius: corner },
      { center: vec(width / 2, height + 0.01), radius: side },
      { center: vec(width, height), radius: corner },
    ],
  };
})();

export interface TableProblem {
  readonly field: string;
  readonly message: string;
}

/** Revisa que una mesa sea coherente antes de usarla en el motor. */
export function validateTable(t: TableSpec): TableProblem[] {
  const problems: TableProblem[] = [];
  if (!(t.width > 0) || !(t.height > 0))
    problems.push({ field: "size", message: "Ancho y alto deben ser positivos" });
  if (!(t.ballRadius > 0))
    problems.push({ field: "ballRadius", message: "El radio de bola debe ser positivo" });
  if (t.ballRadius * 2 >= Math.min(t.width, t.height))
    problems.push({ field: "ballRadius", message: "La bola no cabe en la mesa" });
  t.pockets.forEach((p, i) => {
    if (!(p.radius > t.ballRadius))
      problems.push({ field: `pockets[${i}]`, message: "La tronera debe ser más grande que la bola" });
  });
  return problems;
}
