/**
 * Glicko-2 (Mark Glickman, «Example of the Glicko-2 system», 2013).
 *
 * Cada modo tiene su propio rating. Se actualiza por período: todas las
 * partidas clasificatorias del período a la vez. Si un jugador no jugó en el
 * período, solo crece su desviación (RD), porque sabemos menos de él.
 */

export interface Rating {
  /** Rating en la escala clásica (1500 al empezar). */
  readonly r: number;
  /** Desviación del rating (350 al empezar). */
  readonly rd: number;
  /** Volatilidad. */
  readonly sigma: number;
}

export interface Resultado {
  readonly rival: Rating;
  /** 1 gana, 0 pierde, 0.5 empate. */
  readonly puntos: 0 | 0.5 | 1;
}

export const ESCALA = 173.7178;
export const INICIAL: Rating = { r: 1500, rd: 350, sigma: 0.06 };
/** Cuánto puede cambiar la volatilidad. Glickman recomienda entre 0.3 y 1.2. */
export const TAU = 0.5;
/** Una RD no pasa de la inicial aunque alguien deje de jugar mucho tiempo. */
const RD_MAX = 350;
/** Ni baja de 30: siempre queda algo de incertidumbre. */
const RD_MIN = 30;
const EPSILON = 1e-6;

const g = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const esperado = (mu: number, muJ: number, phiJ: number) => 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));

/** Nuevo rating de un jugador tras un período con estos resultados. */
export function actualizar(jugador: Rating, resultados: readonly Resultado[], tau = TAU): Rating {
  const mu = (jugador.r - 1500) / ESCALA;
  const phi = jugador.rd / ESCALA;
  const sigma = jugador.sigma;

  if (resultados.length === 0) {
    const phiNuevo = Math.sqrt(phi * phi + sigma * sigma);
    return { r: jugador.r, rd: Math.min(RD_MAX, phiNuevo * ESCALA), sigma };
  }

  let vInv = 0;
  let suma = 0;
  for (const { rival, puntos } of resultados) {
    const muJ = (rival.r - 1500) / ESCALA;
    const phiJ = rival.rd / ESCALA;
    const gj = g(phiJ);
    const e = esperado(mu, muJ, phiJ);
    vInv += gj * gj * e * (1 - e);
    suma += gj * (puntos - e);
  }
  const v = 1 / vInv;
  const delta = v * suma;

  // Nueva volatilidad por el método de Illinois (paso 5 del documento).
  const a = Math.log(sigma * sigma);
  const f = (x: number) => {
    const ex = Math.exp(x);
    const d = phi * phi + v + ex;
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * d * d) - (x - a) / (tau * tau);
  };
  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else {
    let k = 1;
    while (f(a - k * tau) < 0) k++;
    B = a - k * tau;
  }
  let fA = f(A);
  let fB = f(B);
  for (let i = 0; Math.abs(B - A) > EPSILON && i < 100; i++) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else fA /= 2;
    B = C;
    fB = fC;
  }
  const sigmaNueva = Math.exp(A / 2);

  const phiEstrella = Math.sqrt(phi * phi + sigmaNueva * sigmaNueva);
  const phiNuevo = 1 / Math.sqrt(1 / (phiEstrella * phiEstrella) + 1 / v);
  const muNuevo = mu + phiNuevo * phiNuevo * suma;

  return {
    r: muNuevo * ESCALA + 1500,
    rd: Math.max(RD_MIN, Math.min(RD_MAX, phiNuevo * ESCALA)),
    sigma: sigmaNueva,
  };
}

/** Rating que se muestra y se usa en tablas: conservador, baja si la RD es alta. */
export const ratingVisible = (x: Rating): number => Math.round(x.r - 2 * x.rd);

/** Probabilidad de que A le gane a B, para mostrarla o para emparejar. */
export function probabilidad(a: Rating, b: Rating): number {
  const phi = Math.sqrt(a.rd * a.rd + b.rd * b.rd) / ESCALA;
  return esperado((a.r - 1500) / ESCALA, (b.r - 1500) / ESCALA, phi);
}
