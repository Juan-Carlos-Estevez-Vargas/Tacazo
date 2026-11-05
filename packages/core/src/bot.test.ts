import { describe, expect, it } from "vitest";
import {
  POOL_9FT,
  bola8,
  botMove,
  cloneWorld,
  createRng,
  createWorld,
  datan,
  datan2,
  rack8,
  simulateShot,
  type BotLevel,
} from "./index.js";

describe("datan2", () => {
  it("coincide con Math.atan2", () => {
    for (let a = -3.1; a <= 3.1; a += 0.0173) {
      const x = Math.cos(a) * 2.3;
      const y = Math.sin(a) * 2.3;
      expect(Math.abs(datan2(y, x) - Math.atan2(y, x))).toBeLessThan(1e-14);
    }
    expect(datan2(0, 0)).toBe(0);
    expect(datan2(1, 0)).toBeCloseTo(Math.PI / 2, 15);
    expect(datan(1e9)).toBeCloseTo(Math.atan(1e9), 15);
  });
});

/** Juega una partida entera entre dos bots y devuelve quién ganó. */
function play(levels: [BotLevel, BotLevel], seed: number) {
  const rng = createRng(seed);
  const w = createWorld(POOL_9FT, rack8(POOL_9FT, rng));
  let s = bola8.newGame(0);
  let shots = 0;
  while (s.phase !== "terminada" && shots < 200) {
    const m = botMove(w, s, levels[s.turn], rng);
    if (m.place) bola8.placeCueBall(w, s.ballInHand, m.place.x, m.place.y);
    const before = bola8.ballsOnTable(w);
    const res = simulateShot(w, m.shot);
    const v = bola8.judgeShot(s, before, res.events, m.call);
    for (const id of v.respot) bola8.spotBall(w, id);
    s = v.state;
    shots++;
  }
  return { s, shots };
}

describe("bot", () => {
  it("no modifica el mundo que recibe y juega igual con la misma semilla", () => {
    const w = createWorld(POOL_9FT, rack8(POOL_9FT, createRng(1)));
    const copy = cloneWorld(w);
    const s = { ...bola8.newGame(), phase: "juego" as const, ballInHand: "cualquiera" as const };
    const a = botMove(w, s, "medio", createRng(5));
    const b = botMove(w, s, "medio", createRng(5));
    expect(a).toEqual(b);
    expect(w.balls).toEqual(copy.balls);
    expect(a.place).toBeDefined();
  });

  it("termina partidas completas", () => {
    for (const seed of [1, 2]) {
      const { s, shots } = play(["dificil", "dificil"], seed);
      expect(s.phase, `semilla ${seed}: ${shots} tiros`).toBe("terminada");
    }
  }, 60_000);

  it("el difícil le gana al fácil la mayoría de las veces", () => {
    let wins = 0;
    for (let seed = 10; seed < 16; seed++) if (play(["dificil", "facil"], seed).s.winner === 0) wins++;
    expect(wins).toBeGreaterThanOrEqual(4);
  }, 120_000);
});
