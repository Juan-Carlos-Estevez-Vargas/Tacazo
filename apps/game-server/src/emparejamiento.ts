/**
 * Cola de emparejamiento por modo y sala.
 *
 * - Al entrar, cada jugador acepta rivales a ±RANGO_INICIAL de su rating. El
 *   rango crece con la espera hasta RANGO_MAXIMO.
 * - Primero se busca en la misma región; tras ESPERA_REGION se acepta cualquiera.
 * - No se repite un rival de las últimas REPETIDOS partidas salvo tras ESPERA_REPETIDO.
 * - Se atiende primero a quien lleva más tiempo esperando.
 *
 * No depende de la red ni del reloj: `emparejar(ahora)` es una función pura del
 * estado de la cola, así las pruebas cubren cada regla.
 */

export interface EnCola {
  readonly id: string;
  /** Rating Glicko-2 del modo (r, no el visible). */
  readonly rating: number;
  readonly region: string;
  /** Ids de los últimos rivales, el más reciente al final. */
  readonly recientes: readonly string[];
  /** Momento de entrada en milisegundos. */
  readonly desde: number;
}

export interface Pareja {
  readonly a: EnCola;
  readonly b: EnCola;
}

export const RANGO_INICIAL = 100;
export const RANGO_MAXIMO = 500;
/** Puntos de rango que se suman por segundo de espera. */
export const RANGO_POR_SEGUNDO = 10;
export const ESPERA_REGION = 15_000;
export const REPETIDOS = 3;
export const ESPERA_REPETIDO = 60_000;

export const rango = (j: EnCola, ahora: number): number =>
  Math.min(RANGO_MAXIMO, RANGO_INICIAL + (Math.max(0, ahora - j.desde) / 1000) * RANGO_POR_SEGUNDO);

const repetido = (a: EnCola, b: EnCola) =>
  a.recientes.slice(-REPETIDOS).includes(b.id) || b.recientes.slice(-REPETIDOS).includes(a.id);

/** ¿Pueden jugar a y b ahora mismo? Las dos partes tienen que aceptar. */
export function compatibles(a: EnCola, b: EnCola, ahora: number): boolean {
  if (a.id === b.id) return false;
  const dif = Math.abs(a.rating - b.rating);
  if (dif > rango(a, ahora) || dif > rango(b, ahora)) return false;
  const esperaMenor = ahora - Math.max(a.desde, b.desde);
  if (a.region !== b.region && esperaMenor < ESPERA_REGION) return false;
  if (repetido(a, b) && esperaMenor < ESPERA_REPETIDO) return false;
  return true;
}

export class Cola {
  private readonly jugadores = new Map<string, EnCola>();

  get tamano(): number {
    return this.jugadores.size;
  }

  entrar(j: EnCola): void {
    this.jugadores.set(j.id, j);
  }

  salir(id: string): boolean {
    return this.jugadores.delete(id);
  }

  /** Forma todas las parejas posibles y las saca de la cola. */
  emparejar(ahora: number): Pareja[] {
    const orden = [...this.jugadores.values()].sort((x, y) => x.desde - y.desde || (x.id < y.id ? -1 : 1));
    const usados = new Set<string>();
    const parejas: Pareja[] = [];
    for (const a of orden) {
      if (usados.has(a.id)) continue;
      let mejor: EnCola | null = null;
      let mejorPuntaje = Infinity;
      for (const b of orden) {
        if (b === a || usados.has(b.id) || !compatibles(a, b, ahora)) continue;
        // Preferir misma región y rating parecido.
        const puntaje = Math.abs(a.rating - b.rating) + (a.region === b.region ? 0 : 1000);
        if (puntaje < mejorPuntaje) {
          mejor = b;
          mejorPuntaje = puntaje;
        }
      }
      if (mejor) {
        usados.add(a.id).add(mejor.id);
        parejas.push({ a, b: mejor });
      }
    }
    for (const id of usados) this.jugadores.delete(id);
    return parejas;
  }
}

/** Cada modo y sala (nivel de apuesta) tiene su cola. */
export class Colas {
  private readonly colas = new Map<string, Cola>();

  static clave(modo: string, sala: string): string {
    return `${modo}/${sala}`;
  }

  cola(modo: string, sala: string): Cola {
    const k = Colas.clave(modo, sala);
    let c = this.colas.get(k);
    if (!c) this.colas.set(k, (c = new Cola()));
    return c;
  }

  /** Saca a un jugador de todas las colas (por ejemplo, al desconectarse). */
  salir(id: string): void {
    for (const c of this.colas.values()) c.salir(id);
  }

  emparejar(ahora: number): { modo: string; sala: string; pareja: Pareja }[] {
    const out: { modo: string; sala: string; pareja: Pareja }[] = [];
    for (const [k, c] of this.colas) {
      const [modo = "", sala = ""] = k.split("/");
      for (const pareja of c.emparejar(ahora)) out.push({ modo, sala, pareja });
    }
    return out;
  }
}
