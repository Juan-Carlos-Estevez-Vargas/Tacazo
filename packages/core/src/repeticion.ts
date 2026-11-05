import {
  createWorld,
  simulateShot,
  worldHash,
  type BallInit,
  type Shot,
  type SimEvent,
  type World,
} from "./physics.js";
import * as bola8 from "./reglas/bola8.js";
import { POOL_9FT, type TableSpec } from "./table.js";

type Jugador = 0 | 1;

export type EntradaRepeticion =
  | {
      readonly tipo: "tiro";
      readonly jugador: Jugador;
      readonly seq: number;
      readonly tiro: Shot;
      readonly cantar: number | null;
      readonly blanca: { readonly x: number; readonly y: number } | null;
      /** Huella del mundo justo después del tiro (antes de reponer bolas). */
      readonly hash: string;
      /** Milisegundos del turno usados antes de tirar (para las señales anti-trampas). */
      readonly ms?: number;
    }
  | { readonly tipo: "tiempo"; readonly jugador: Jugador }
  | { readonly tipo: "abandono"; readonly jugador: Jugador };

/**
 * Todo lo necesario para volver a jugar una partida de bola 8 con el motor:
 * la posición inicial y las entradas de los jugadores. Las posiciones de
 * cada tiro no se guardan; se recalculan, y las huellas confirman que dan lo
 * mismo que en el servidor.
 */
export interface Repeticion {
  readonly formato: 1;
  readonly motor: number;
  readonly sala: string;
  readonly mesa: string;
  readonly semilla: number;
  readonly inicio: readonly BallInit[];
  readonly jugadores: readonly string[];
  readonly entradas: readonly EntradaRepeticion[];
  readonly ganador: Jugador | null;
  readonly motivo: string | null;
}

const MESAS: Record<string, TableSpec> = { [POOL_9FT.id]: POOL_9FT };

export interface PasoRepeticion {
  readonly entrada: EntradaRepeticion;
  readonly reglas: bola8.Bola8State;
  /** Huella recalculada (solo en tiros). */
  readonly hash: string | null;
  /** Lo que pasó en el tiro y cuántos pasos de física duró (vacío si no fue tiro). */
  readonly eventos: readonly SimEvent[];
  readonly pasos: number;
  readonly coincide: boolean;
}

/**
 * Recorre una repetición entrada por entrada. `alTiro` recibe el mundo justo
 * antes de cada tiro (con la blanca ya colocada) para que el cliente lo anime.
 */
export function* reproducir(
  rep: Repeticion,
  alTiro?: (w: World, tiro: Shot) => void,
): Generator<PasoRepeticion, void, void> {
  const mesa = MESAS[rep.mesa];
  if (!mesa) throw new Error(`Mesa desconocida: ${rep.mesa}`);
  const w = createWorld(mesa, rep.inicio);
  let reglas = bola8.newGame(0);
  for (const e of rep.entradas) {
    if (e.tipo === "tiempo") {
      reglas = bola8.timeoutFoul(reglas);
      yield { entrada: e, reglas, hash: null, eventos: [], pasos: 0, coincide: true };
      continue;
    }
    if (e.tipo === "abandono") {
      reglas = bola8.forfeit(reglas, e.jugador);
      yield { entrada: e, reglas, hash: null, eventos: [], pasos: 0, coincide: true };
      continue;
    }
    if (e.blanca) bola8.placeCueBall(w, reglas.ballInHand, e.blanca.x, e.blanca.y);
    alTiro?.(w, e.tiro);
    const antes = bola8.ballsOnTable(w);
    const res = simulateShot(w, e.tiro);
    const v = bola8.judgeShot(reglas, antes, res.events, e.cantar === null ? {} : { pocket: e.cantar });
    const hash = worldHash(w);
    for (const id of v.respot) bola8.spotBall(w, id);
    reglas = v.state;
    yield { entrada: e, reglas, hash, eventos: res.events, pasos: res.steps, coincide: hash === e.hash };
  }
}

/** Vuelve a jugar la partida entera y dice si todas las huellas coinciden. */
export function verificarRepeticion(rep: Repeticion): { ok: boolean; fallos: number[] } {
  const fallos: number[] = [];
  let ultimo: bola8.Bola8State | null = null;
  try {
    for (const p of reproducir(rep)) {
      if (!p.coincide && p.entrada.tipo === "tiro") fallos.push(p.entrada.seq);
      ultimo = p.reglas;
    }
  } catch {
    // Una repetición alterada puede pedir algo imposible (blanca fuera, partida terminada).
    return { ok: false, fallos: fallos.length ? fallos : [-1] };
  }
  const ganadorOk = (ultimo?.winner ?? null) === rep.ganador;
  return { ok: fallos.length === 0 && ganadorOk, fallos };
}
