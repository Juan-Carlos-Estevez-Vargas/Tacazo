import { POOL_9FT } from "@tacazo/core";
import { describe, expect, it } from "vitest";
import { trazarGuia } from "./guia.js";

const R = POOL_9FT.ballRadius;

describe("guía de apuntado", () => {
  it("de frente: la fantasma queda a dos radios y la bola sale recta", () => {
    const g = trazarGuia(POOL_9FT, { x: 0.5, y: 0.6 }, 0, [{ id: 3, x: 1.0, y: 0.6 }]);
    expect(g.bola).toBe(3);
    expect(g.fantasma.x).toBeCloseTo(1.0 - 2 * R, 9);
    expect(g.salidaBola?.x).toBeCloseTo(1, 9);
    expect(g.salidaBlanca).toBeNull();
  });

  it("con corte, la blanca sale perpendicular a la bola", () => {
    const g = trazarGuia(POOL_9FT, { x: 0.5, y: 0.6 }, 0, [{ id: 1, x: 1.0, y: 0.6 + R }]);
    expect(g.bola).toBe(1);
    const dot = g.salidaBola!.x * g.salidaBlanca!.x + g.salidaBola!.y * g.salidaBlanca!.y;
    expect(Math.abs(dot)).toBeLessThan(1e-9);
    // La bola sale hacia arriba-derecha; la blanca hacia abajo-derecha.
    expect(g.salidaBola!.y).toBeGreaterThan(0);
    expect(g.salidaBlanca!.y).toBeLessThan(0);
  });

  it("sin bolas en la línea, llega a la banda", () => {
    const g = trazarGuia(POOL_9FT, { x: 0.5, y: 0.6 }, Math.PI, [{ id: 1, x: 1.0, y: 0.2 }]);
    expect(g.bola).toBeNull();
    expect(g.fantasma.x).toBeCloseTo(R, 9);
  });

  it("ignora bolas que quedan detrás", () => {
    const g = trazarGuia(POOL_9FT, { x: 1.0, y: 0.6 }, 0, [{ id: 1, x: 0.5, y: 0.6 }]);
    expect(g.bola).toBeNull();
  });
});
