/**
 * Matemática determinista. `Math.sin`, `Math.cos`, `Math.hypot` y compañía no
 * dan el mismo último bit en todos los motores de JavaScript (V8 en el
 * servidor, JavaScriptCore en iPhone). Aquí solo se usan + - * / y
 * `Math.sqrt`, que IEEE 754 obliga a redondear igual en todas partes.
 */

export const PI = 3.141592653589793;
const TWO_PI = 6.283185307179586;
const HALF_PI = 1.5707963267948966;

/** Lleva un ángulo a [-π, π]. */
function wrap(x: number): number {
  return x - TWO_PI * Math.floor((x + PI) / TWO_PI);
}

/** Serie de Taylor de sin en [-π/2, π/2]; error menor que 1e-12. */
function sinCore(x: number): number {
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let k = 1; k <= 9; k++) {
    term *= -x2 / (2 * k * (2 * k + 1));
    sum += term;
  }
  return sum;
}

export function dsin(angle: number): number {
  let x = wrap(angle);
  if (x > HALF_PI) x = PI - x;
  else if (x < -HALF_PI) x = -PI - x;
  return sinCore(x);
}

export function dcos(angle: number): number {
  return dsin(angle + HALF_PI);
}

export const DEG = PI / 180;

/** Logaritmo natural para x > 0: ln x = 2·artanh((x−1)/(x+1)), tras llevar x cerca de 1. */
export function dln(x: number): number {
  if (!(x > 0)) return NaN;
  let k = 0;
  while (x > 1.5) {
    x /= 2;
    k++;
  }
  while (x < 0.75) {
    x *= 2;
    k--;
  }
  const z = (x - 1) / (x + 1);
  const z2 = z * z;
  let term = z;
  let sum = 0;
  for (let n = 1; n < 40; n += 2) {
    sum += term / n;
    term *= z2;
  }
  return 2 * sum + k * 0.6931471805599453;
}

const SQRT3 = 1.7320508075688772;
const TAN_PI_12 = 0.2679491924311227;

/** Arcotangente en [-π/2, π/2]; error menor que 1e-15. */
export function datan(x: number): number {
  if (x < 0) return -datan(-x);
  if (x > 1) return HALF_PI - datan(1 / x);
  if (x > TAN_PI_12) return PI / 6 + datan((x * SQRT3 - 1) / (x + SQRT3));
  const x2 = x * x;
  let term = x;
  let sum = 0;
  for (let n = 1; n < 30; n += 2) {
    sum += term / n;
    term *= -x2;
  }
  return sum;
}

/** Ángulo del vector (x, y), como Math.atan2. */
export function datan2(y: number, x: number): number {
  if (x > 0) return datan(y / x);
  if (x < 0) return y >= 0 ? datan(y / x) + PI : datan(y / x) - PI;
  if (y > 0) return HALF_PI;
  if (y < 0) return -HALF_PI;
  return 0;
}
