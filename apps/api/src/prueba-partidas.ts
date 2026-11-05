// Partidas de bots para las pruebas. No se usa en producción.
import {
  ENGINE_VERSION,
  POOL_9FT,
  bola8,
  botMove,
  createRng,
  createWorld,
  rack8,
  simulateShot,
  STEP,
  worldHash,
  type BotLevel,
  type EntradaRepeticion,
  type Repeticion,
} from "@tacazo/core";

/** Partida entre dos bots; `ms` decide el tiempo de cada tiro. */
export function partida(
  semilla: number,
  niveles: [BotLevel, BotLevel],
  ms: (j: 0 | 1, i: number, animacion: number) => number,
): Repeticion {
  const rng = createRng(semilla);
  const inicio = rack8(POOL_9FT, rng);
  const w = createWorld(POOL_9FT, inicio);
  let s = bola8.newGame(0);
  const entradas: EntradaRepeticion[] = [];
  let animacion = 0;
  for (let i = 0; s.phase !== "terminada" && i < 200; i++) {
    const j = s.turn;
    const mov = botMove(w, s, niveles[j], rng);
    const espera = ms(j, i, animacion);
    if (mov.place) bola8.placeCueBall(w, s.ballInHand, mov.place.x, mov.place.y);
    const antes = bola8.ballsOnTable(w);
    const res = simulateShot(w, mov.shot);
    const v = bola8.judgeShot(s, antes, res.events, mov.call);
    const hash = worldHash(w);
    animacion = res.steps * STEP * 1000;
    for (const id of v.respot) bola8.spotBall(w, id);
    s = v.state;
    entradas.push({
      tipo: "tiro",
      jugador: j,
      seq: i + 1,
      tiro: mov.shot,
      cantar: mov.call.pocket ?? null,
      blanca: mov.place ?? null,
      hash,
      ms: espera,
    });
  }
  return {
    formato: 1,
    motor: ENGINE_VERSION,
    sala: `prueba-${semilla}`,
    mesa: POOL_9FT.id,
    semilla,
    inicio,
    jugadores: ["A", "B"],
    entradas,
    ganador: s.winner,
    motivo: s.loss ?? null,
  };
}
