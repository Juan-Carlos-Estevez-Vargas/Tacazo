import { describe, expect, it } from "vitest";
import { POOL_9FT, createRng, createWorld, rack8, type SimEvent } from "../index.js";
import {
  ballsOnTable,
  canPlaceCueBall,
  judgeShot,
  legalTargets,
  needsCall,
  newGame,
  placeCueBall,
  spotBall,
  type Bola8State,
} from "./bola8.js";

const hit = (a: number, b: number): SimEvent => ({ kind: "ball", step: 0, a, b, speed: 1 });
const rail = (ball: number): SimEvent => ({ kind: "cushion", step: 0, ball, speed: 1 });
const pot = (ball: number, pocket = 0): SimEvent => ({ kind: "pocket", step: 0, ball, pocket });

const ALL = Array.from({ length: 16 }, (_, i) => i);
const playing = (over: Partial<Bola8State> = {}): Bola8State => ({
  ...newGame(),
  phase: "juego",
  ballInHand: "no",
  ...over,
});
const withGroups = (over: Partial<Bola8State> = {}) => playing({ groups: ["lisas", "rayadas"], ...over });

describe("saque", () => {
  it("meter una bola en el saque es legal y sigue el mismo jugador con la mesa abierta", () => {
    const v = judgeShot(newGame(), ALL, [hit(0, 1), hit(1, 2), pot(3)]);
    expect(v.fouls).toEqual([]);
    expect(v.keepsTurn).toBe(true);
    expect(v.state.groups).toEqual([null, null]);
    expect(v.state.phase).toBe("juego");
  });

  it("cuatro bolas a banda sin meter ninguna es legal y pasa el turno", () => {
    const v = judgeShot(newGame(), ALL, [hit(0, 1), rail(2), rail(3), rail(4), rail(5)]);
    expect(v.fouls).toEqual([]);
    expect(v.keepsTurn).toBe(false);
    expect(v.state.turn).toBe(1);
  });

  it("menos de cuatro bolas a banda es saque ilegal: bola en mano en la cabecera", () => {
    const v = judgeShot(newGame(), ALL, [hit(0, 1), rail(2), rail(3)]);
    expect(v.fouls).toContain("saque-ilegal");
    expect(v.state.ballInHand).toBe("cabecera");
    expect(v.state.turn).toBe(1);
  });

  it("la 8 en el saque se vuelve a poner y no pierde", () => {
    const v = judgeShot(newGame(), ALL, [hit(0, 1), pot(8)]);
    expect(v.respot).toEqual([8]);
    expect(v.state.phase).toBe("juego");
    expect(v.state.winner).toBeNull();
  });

  it("blanca en tronera en el saque: falta y bola en mano en la cabecera", () => {
    const v = judgeShot(newGame(), ALL, [hit(0, 1), pot(3), pot(0)]);
    expect(v.fouls).toContain("blanca-en-tronera");
    expect(v.state.ballInHand).toBe("cabecera");
    expect(v.keepsTurn).toBe(false);
  });
});

describe("faltas en juego", () => {
  it("no tocar ninguna bola", () => {
    const v = judgeShot(withGroups(), ALL, [rail(0)]);
    expect(v.fouls).toContain("sin-contacto");
    expect(v.state.ballInHand).toBe("cualquiera");
    expect(v.state.turn).toBe(1);
  });

  it("tocar primero una bola del rival", () => {
    const v = judgeShot(withGroups(), ALL, [hit(0, 10), rail(10)]);
    expect(v.fouls).toEqual(["primera-bola-incorrecta"]);
  });

  it("tocar primero la 8 con la mesa abierta", () => {
    const v = judgeShot(playing(), ALL, [hit(0, 8), rail(8)]);
    expect(v.fouls).toEqual(["primera-bola-incorrecta"]);
  });

  it("ninguna bola a banda después del contacto y nada metido", () => {
    const v = judgeShot(withGroups(), ALL, [rail(0), hit(0, 2)]);
    expect(v.fouls).toEqual(["sin-banda"]);
  });

  it("blanca en tronera aunque meta una propia", () => {
    const v = judgeShot(withGroups(), ALL, [hit(0, 2), pot(2), pot(0)]);
    expect(v.fouls).toEqual(["blanca-en-tronera"]);
    expect(v.keepsTurn).toBe(false);
    expect(v.state.ballInHand).toBe("cualquiera");
  });
});

describe("grupos y turno", () => {
  it("con la mesa abierta, la primera bola metida asigna el grupo", () => {
    const v = judgeShot(playing({ turn: 1 }), ALL, [hit(0, 11), pot(11), pot(3)]);
    expect(v.state.groups).toEqual(["lisas", "rayadas"]);
    expect(v.keepsTurn).toBe(true);
  });

  it("meter una del rival no da otro tiro", () => {
    const v = judgeShot(withGroups(), ALL, [hit(0, 2), hit(2, 10), pot(10)]);
    expect(v.fouls).toEqual([]);
    expect(v.keepsTurn).toBe(false);
  });

  it("con falta no se asigna grupo", () => {
    const v = judgeShot(playing(), ALL, [hit(0, 3), pot(3), pot(0)]);
    expect(v.state.groups).toEqual([null, null]);
  });

  it("bolas legales: grupo propio, luego la 8", () => {
    const s = withGroups();
    expect(legalTargets(s, ALL)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const onlyStripes = [0, 8, 9, 10];
    expect(legalTargets(s, onlyStripes)).toEqual([8]);
    expect(needsCall(s, onlyStripes)).toBe(true);
    expect(legalTargets(playing(), [0, 1, 8, 9])).toEqual([1, 9]);
  });
});

describe("la 8", () => {
  const onEight = [0, 8, 9, 10];
  it("gana si la mete en la tronera cantada sin falta", () => {
    const v = judgeShot(withGroups(), onEight, [hit(0, 8), pot(8, 3)], { pocket: 3 });
    expect(v.state.phase).toBe("terminada");
    expect(v.state.winner).toBe(0);
    expect(v.state.loss).toBeNull();
  });

  it("pierde si la mete en otra tronera", () => {
    const v = judgeShot(withGroups(), onEight, [hit(0, 8), pot(8, 2)], { pocket: 3 });
    expect(v.state.winner).toBe(1);
    expect(v.state.loss).toBe("8-en-otra-tronera");
  });

  it("pierde si no cantó", () => {
    const v = judgeShot(withGroups(), onEight, [hit(0, 8), pot(8, 2)]);
    expect(v.state.loss).toBe("8-sin-cantar");
  });

  it("pierde si mete la 8 y también la blanca", () => {
    const v = judgeShot(withGroups(), onEight, [hit(0, 8), pot(8, 3), pot(0, 1)], { pocket: 3 });
    expect(v.state.loss).toBe("8-con-falta");
  });

  it("pierde si mete la 8 antes de tiempo", () => {
    const v = judgeShot(withGroups(), ALL, [hit(0, 2), hit(2, 8), pot(8)]);
    expect(v.state.loss).toBe("8-antes-de-tiempo");
    expect(v.state.winner).toBe(1);
  });

  it("no se puede seguir jugando una partida terminada", () => {
    const v = judgeShot(withGroups(), onEight, [hit(0, 8), pot(8, 3)], { pocket: 3 });
    expect(() => judgeShot(v.state, onEight, [])).toThrow();
  });
});

describe("bola en mano y bolas repuestas", () => {
  const w = () => createWorld(POOL_9FT, rack8(POOL_9FT, createRng(4)));

  it("en la cabecera solo detrás de la línea", () => {
    const world = w();
    expect(canPlaceCueBall(world, "cabecera", 0.3, 0.6)).toBe(true);
    expect(canPlaceCueBall(world, "cabecera", 1.2, 0.6)).toBe(false);
    expect(canPlaceCueBall(world, "cualquiera", 1.2, 0.6)).toBe(true);
    expect(canPlaceCueBall(world, "no", 0.3, 0.6)).toBe(false);
  });

  it("no encima de otra bola ni fuera de la mesa", () => {
    const world = w();
    const one = world.balls.find((b) => b.id === 1)!;
    expect(canPlaceCueBall(world, "cualquiera", one.x, one.y)).toBe(false);
    expect(canPlaceCueBall(world, "cualquiera", -0.1, 0.6)).toBe(false);
    expect(() => placeCueBall(world, "cualquiera", one.x, one.y)).toThrow();
    placeCueBall(world, "cualquiera", 1.0, 0.3);
    expect(world.balls[0]).toMatchObject({ x: 1.0, y: 0.3, onTable: true });
  });

  it("la 8 vuelve al punto de pie, o detrás si está ocupado", () => {
    const world = w();
    const eight = world.balls.find((b) => b.id === 8)!;
    eight.onTable = false;
    spotBall(world, 8);
    expect(eight.onTable).toBe(true);
    expect(eight.y).toBe(POOL_9FT.footSpot.y);
    for (const o of world.balls)
      if (o !== eight && o.onTable)
        expect((o.x - eight.x) ** 2 + (o.y - eight.y) ** 2).toBeGreaterThanOrEqual(
          (2 * POOL_9FT.ballRadius) ** 2,
        );
    expect(ballsOnTable(world)).toContain(8);
  });
});
