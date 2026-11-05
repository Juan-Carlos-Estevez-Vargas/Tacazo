import { describe, expect, it } from "vitest";
import {
  POOL_9FT,
  cloneWorld,
  createRng,
  createWorld,
  dcos,
  dln,
  dsin,
  kineticEnergy,
  rack8,
  simulateShot,
  stepWorld,
  strike,
  validateShot,
  worldHash,
  type BallInit,
  type Shot,
  type World,
} from "./index.js";

const T = POOL_9FT;
const R = T.ballRadius;
const mid = T.height / 2;
const shot = (s: Partial<Shot>): Shot => ({ angle: 0, power: 0.4, side: 0, top: 0, elevation: 0, ...s });
const world = (balls: BallInit[]): World => createWorld(T, balls);
const ball = (w: World, id: number) => w.balls.find((b) => b.id === id)!;

describe("matemática determinista", () => {
  it("dsin y dcos coinciden con Math hasta 1e-12", () => {
    for (let a = -20; a <= 20; a += 0.0137) {
      expect(Math.abs(dsin(a) - Math.sin(a))).toBeLessThan(1e-12);
      expect(Math.abs(dcos(a) - Math.cos(a))).toBeLessThan(1e-12);
    }
  });

  it("dln coincide con Math.log", () => {
    for (const x of [0.01, 0.5, 0.75, 0.95, 1, 2, 10, 1234.5]) expect(dln(x)).toBeCloseTo(Math.log(x), 12);
    expect(dln(0)).toBeNaN();
  });
});

describe("tiro", () => {
  it("valida potencia, efecto e inclinación", () => {
    expect(validateShot(shot({}))).toEqual([]);
    expect(validateShot(shot({ power: 2 })).map((p) => p.field)).toContain("power");
    expect(validateShot(shot({ side: 0.8, top: 0.8 })).map((p) => p.field)).toContain("side");
    expect(validateShot(shot({ elevation: 80 })).map((p) => p.field)).toContain("elevation");
    expect(validateShot(shot({ angle: Number.NaN })).map((p) => p.field)).toContain("angle");
    expect(() => strike(world([{ id: 0, x: 1, y: mid }]), shot({ power: 5 }))).toThrow();
  });

  it("al centro, la blanca primero desliza y luego rueda", () => {
    const w = world([{ id: 0, x: 0.3, y: mid }]);
    strike(w, shot({ power: 0.3 }));
    const cue = ball(w, 0);
    expect(cue.wy).toBe(0);
    for (let i = 0; i < 480; i++) stepWorld(w);
    expect(cue.wy).toBeCloseTo(cue.vx / R, 9);
    expect(cue.vy).toBe(0);
  });

  it("con efecto arriba la blanca sigue tras la bola, con efecto abajo vuelve y al centro se para", () => {
    /** vx de la blanca 0,3 s después de chocar con la bola. */
    const after = (top: number): number => {
      const w = world([
        { id: 0, x: 0.8, y: mid },
        { id: 1, x: 1.3, y: mid },
      ]);
      strike(w, shot({ top, power: 0.25 }));
      while (!w.events.some((e) => e.kind === "ball")) stepWorld(w);
      for (let i = 0; i < 144; i++) stepWorld(w);
      return ball(w, 0).vx;
    };
    expect(after(0.8)).toBeGreaterThan(0.1);
    expect(after(-0.95)).toBeLessThan(-0.1);
    // A medio metro, sin efecto la blanca ya rueda; para pararla hace falta algo de retroceso.
    expect(Math.abs(after(-0.6))).toBeLessThan(0.05);
  });

  it("efecto a la derecha contra la banda sale hacia la derecha", () => {
    const right = world([{ id: 0, x: 2.0, y: mid }]);
    simulateShot(right, shot({ side: 0.8, power: 0.3 }));
    const left = world([{ id: 0, x: 2.0, y: mid }]);
    simulateShot(left, shot({ side: -0.8, power: 0.3 }));
    // Tirando hacia +x, la derecha es -y.
    expect(ball(right, 0).y).toBeLessThan(mid - 0.02);
    expect(ball(left, 0).y).toBeGreaterThan(mid + 0.02);
  });

  it("taco inclinado con efecto a la derecha hace curva a la derecha", () => {
    const w = world([{ id: 0, x: 0.3, y: mid }]);
    strike(w, shot({ side: 0.7, elevation: 60, power: 0.5 }));
    for (let i = 0; i < 300; i++) stepWorld(w);
    expect(ball(w, 0).y).toBeLessThan(mid - 0.01);
  });

  it("el efecto lateral desvía un poco la blanca al lado contrario", () => {
    const w = world([{ id: 0, x: 0.3, y: mid }]);
    strike(w, shot({ side: 1 * 0.99 }));
    expect(ball(w, 0).vy).toBeGreaterThan(0);
  });

  it("una bola directa a la tronera de esquina entra", () => {
    const w = world([
      { id: 0, x: 1.0, y: 0.6 },
      { id: 1, x: 2.2, y: 0.3 },
    ]);
    // Apunta la blanca a la bola en línea con la tronera inferior derecha.
    const px = T.width + 0.02 - 2.2;
    const py = -0.02 - 0.3;
    const pl = Math.sqrt(px * px + py * py);
    const gx = 2.2 - (2 * R * px) / pl;
    const gy = 0.3 - (2 * R * py) / pl;
    const res = simulateShot(w, shot({ angle: Math.atan2(gy - 0.6, gx - 1.0), power: 0.5 }));
    expect(res.events).toContainEqual(expect.objectContaining({ kind: "pocket", ball: 1, pocket: 2 }));
  });
});

describe("saque", () => {
  it("el triángulo tiene 15 bolas sin tocarse, la 8 al centro y la 1 en la punta", () => {
    const balls = rack8(T, createRng(9));
    expect(balls).toHaveLength(16);
    expect(new Set(balls.map((b) => b.id)).size).toBe(16);
    for (let i = 0; i < balls.length; i++)
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i]!;
        const b = balls[j]!;
        expect(Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)).toBeGreaterThan(2 * R);
      }
    expect(balls[1]!.id).toBe(1);
    expect(balls[5]!.id).toBe(8);
  });

  it("un saque fuerte abre el triángulo", () => {
    const w = createWorld(T, rack8(T, createRng(3)));
    const start = w.balls.map((b) => ({ x: b.x, y: b.y }));
    simulateShot(w, shot({ power: 1 }));
    const moved = w.balls.filter(
      (b, i) => !b.onTable || Math.abs(b.x - start[i]!.x) + Math.abs(b.y - start[i]!.y) > 0.15,
    );
    expect(moved.length).toBeGreaterThanOrEqual(10);
  });
});

describe("propiedades", () => {
  const randomWorld = (seed: number): { w: World; s: Shot } => {
    const rng = createRng(seed);
    const balls: BallInit[] = [];
    const n = 2 + Math.floor(rng.next() * 8);
    while (balls.length < n) {
      const x = R + 0.01 + rng.next() * (T.width - 2 * R - 0.02);
      const y = R + 0.01 + rng.next() * (T.height - 2 * R - 0.02);
      if (balls.every((b) => (b.x - x) ** 2 + (b.y - y) ** 2 > (2 * R + 0.002) ** 2))
        balls.push({ id: balls.length, x, y });
    }
    const side = rng.next() * 1.2 - 0.6;
    const top = rng.next() * 1.2 - 0.6;
    const s = shot({
      angle: rng.next() * 6.28,
      power: 0.05 + rng.next() * 0.95,
      side,
      top,
      elevation: rng.next() < 0.2 ? rng.next() * 60 : 0,
    });
    return { w: createWorld(T, balls), s };
  };

  it("la energía nunca aumenta después del golpe", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { w, s } = randomWorld(seed);
      strike(w, s);
      let prev = kineticEnergy(w);
      for (let i = 0; i < 4000 && prev > 0; i++) {
        stepWorld(w);
        const e = kineticEnergy(w);
        expect(e).toBeLessThanOrEqual(prev * (1 + 1e-9) + 1e-12);
        prev = e;
      }
    }
  });

  it("al parar, ninguna bola queda fuera de la mesa ni encima de otra", () => {
    for (let seed = 100; seed < 130; seed++) {
      const { w, s } = randomWorld(seed);
      simulateShot(w, s);
      const on = w.balls.filter((b) => b.onTable);
      for (const b of on) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x).toBeLessThanOrEqual(T.width);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeLessThanOrEqual(T.height);
      }
      for (let i = 0; i < on.length; i++)
        for (let j = i + 1; j < on.length; j++) {
          const d = Math.sqrt((on[i]!.x - on[j]!.x) ** 2 + (on[i]!.y - on[j]!.y) ** 2);
          expect(d).toBeGreaterThan(2 * R - 1e-6);
        }
    }
  });

  it("el mismo tiro da el mismo resultado bit a bit", () => {
    const { w, s } = randomWorld(77);
    const copy = cloneWorld(w);
    simulateShot(w, s);
    simulateShot(copy, s);
    expect(worldHash(copy)).toBe(worldHash(w));
    expect(copy.events).toEqual(w.events);
  });
});
