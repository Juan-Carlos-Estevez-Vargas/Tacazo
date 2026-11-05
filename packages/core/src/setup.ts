import type { BallInit } from "./physics.js";
import type { Rng } from "./rng.js";
import type { TableSpec } from "./table.js";

const SQRT3_2 = 0.8660254037844386;

/** Hueco entre bolas del triángulo; la semilla mueve cada bola un poco más. */
const RACK_GAP = 0.0003;
const RACK_JITTER = 0.0001;

/**
 * Triángulo de bola 8: la 1 en la punta, la 8 en el centro, una lisa y una
 * rayada en las esquinas de atrás y el resto al azar con la semilla. La
 * blanca va en la cabecera. Ids: 0 blanca, 1-7 lisas, 8, 9-15 rayadas.
 */
export function rack8(table: TableSpec, rng: Rng): BallInit[] {
  const R = table.ballRadius;
  const D = 2 * R + RACK_GAP;
  const slots: { x: number; y: number }[] = [];
  for (let r = 0; r < 5; r++)
    for (let k = 0; k <= r; k++)
      slots.push({ x: table.footSpot.x + r * D * SQRT3_2, y: table.footSpot.y + (k - r / 2) * D });

  const pick = <T>(arr: T[]): T => arr.splice(Math.floor(rng.next() * arr.length), 1)[0]!;
  const solids = [2, 3, 4, 5, 6, 7];
  const stripes = [9, 10, 11, 12, 13, 14, 15];
  const order: number[] = new Array<number>(15);
  order[0] = 1;
  order[4] = 8; // fila 3, centro
  const solidCorner = rng.next() < 0.5;
  order[10] = solidCorner ? pick(solids) : pick(stripes);
  order[14] = solidCorner ? pick(stripes) : pick(solids);
  const rest = [...solids, ...stripes];
  for (let i = 0; i < 15; i++) if (order[i] === undefined) order[i] = pick(rest);

  const jitter = () => (rng.next() * 2 - 1) * RACK_JITTER;
  const balls: BallInit[] = [{ id: 0, x: table.headStringX, y: table.height / 2 }];
  slots.forEach((s, i) => balls.push({ id: order[i]!, x: s.x + jitter(), y: s.y + jitter() }));
  return balls;
}
