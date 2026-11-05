/**
 * Generador de números pseudoaleatorios con semilla (mulberry32).
 * El motor nunca usa Math.random: la semilla la da el servidor para que
 * cliente, servidor y repeticiones obtengan exactamente la misma secuencia.
 */
export interface Rng {
  /** Siguiente número en [0, 1). */
  next(): number;
  /** Estado interno, para guardar y reanudar una repetición. */
  readonly state: number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  return {
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    get state() {
      return s;
    },
  };
}
