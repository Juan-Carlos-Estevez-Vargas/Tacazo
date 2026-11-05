/** Vector 2D inmutable en metros (vista cenital de la mesa). */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const vec = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => vec(a.x + b.x, a.y + b.y);
export const sub = (a: Vec2, b: Vec2): Vec2 => vec(a.x - b.x, a.y - b.y);
export const scale = (a: Vec2, k: number): Vec2 => vec(a.x * k, a.y * k);
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
/** Con `Math.sqrt` y no `Math.hypot`, que no es igual en todos los motores. */
export const length = (a: Vec2): number => Math.sqrt(a.x * a.x + a.y * a.y);
export const distance = (a: Vec2, b: Vec2): number => length(sub(a, b));

export function normalize(a: Vec2): Vec2 {
  const l = length(a);
  return l === 0 ? vec(0, 0) : scale(a, 1 / l);
}
