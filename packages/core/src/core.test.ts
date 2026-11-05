import { describe, expect, it } from "vitest";
import {
  ENGINE_VERSION,
  POOL_9FT,
  createRng,
  distance,
  normalize,
  validateTable,
  vec,
  type TableSpec,
} from "./index.js";

describe("rng", () => {
  it("da la misma secuencia con la misma semilla", () => {
    const a = createRng(42);
    const b = createRng(42);
    const sa = Array.from({ length: 5 }, () => a.next());
    const sb = Array.from({ length: 5 }, () => b.next());
    expect(sa).toEqual(sb);
    expect(new Set(sa).size).toBe(5);
  });

  it("queda en [0, 1)", () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const n = r.next();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });

  it("cambia con otra semilla", () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });
});

describe("vec", () => {
  it("normaliza y mide", () => {
    expect(distance(vec(0, 0), vec(3, 4))).toBe(5);
    expect(normalize(vec(0, 0))).toEqual(vec(0, 0));
    expect(normalize(vec(0, 2))).toEqual(vec(0, 1));
  });
});

describe("mesa", () => {
  it("la mesa de pool de 9 pies es válida", () => {
    expect(validateTable(POOL_9FT)).toEqual([]);
    expect(POOL_9FT.pockets).toHaveLength(6);
  });

  it("detecta una tronera más chica que la bola", () => {
    const bad: TableSpec = { ...POOL_9FT, pockets: [{ center: vec(0, 0), radius: 0.01 }] };
    expect(validateTable(bad).map((p) => p.field)).toContain("pockets[0]");
  });

  it("tiene versión de motor", () => {
    expect(ENGINE_VERSION).toBeGreaterThanOrEqual(1);
  });
});
