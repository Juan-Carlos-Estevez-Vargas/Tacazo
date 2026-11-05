import { describe, expect, it } from "vitest";
import { actualizar, INICIAL, probabilidad, ratingVisible } from "./glicko2.js";

describe("Glicko-2", () => {
  it("reproduce el ejemplo del documento de Glickman", () => {
    const nuevo = actualizar({ r: 1500, rd: 200, sigma: 0.06 }, [
      { rival: { r: 1400, rd: 30, sigma: 0.06 }, puntos: 1 },
      { rival: { r: 1550, rd: 100, sigma: 0.06 }, puntos: 0 },
      { rival: { r: 1700, rd: 300, sigma: 0.06 }, puntos: 0 },
    ]);
    expect(nuevo.r).toBeCloseTo(1464.06, 1);
    expect(nuevo.rd).toBeCloseTo(151.52, 1);
    expect(nuevo.sigma).toBeCloseTo(0.05999, 4);
  });

  it("sin partidas solo crece la RD, sin pasar de 350", () => {
    const x = actualizar({ r: 1700, rd: 50, sigma: 0.06 }, []);
    expect(x.r).toBe(1700);
    expect(x.rd).toBeGreaterThan(50);
    expect(actualizar(INICIAL, []).rd).toBe(350);
  });

  it("ganarle a alguien mejor sube más que ganarle a alguien peor", () => {
    const yo = { r: 1500, rd: 100, sigma: 0.06 };
    const contraFuerte = actualizar(yo, [{ rival: { r: 1800, rd: 80, sigma: 0.06 }, puntos: 1 }]);
    const contraDebil = actualizar(yo, [{ rival: { r: 1200, rd: 80, sigma: 0.06 }, puntos: 1 }]);
    expect(contraFuerte.r - 1500).toBeGreaterThan(contraDebil.r - 1500);
    expect(contraDebil.r).toBeGreaterThan(1500);
  });

  it("la RD baja al jugar y nunca de 30", () => {
    let x = INICIAL;
    for (let i = 0; i < 200; i++) x = actualizar(x, [{ rival: INICIAL, puntos: i % 2 ? 1 : 0 }]);
    expect(x.rd).toBeGreaterThanOrEqual(30);
    expect(x.rd).toBeLessThan(100);
    expect(Math.abs(x.r - 1500)).toBeLessThan(150);
  });

  it("el rating visible es conservador y la probabilidad es simétrica", () => {
    expect(ratingVisible(INICIAL)).toBe(800);
    const a = { r: 1600, rd: 60, sigma: 0.06 };
    const b = { r: 1500, rd: 90, sigma: 0.06 };
    expect(probabilidad(a, b)).toBeGreaterThan(0.5);
    expect(probabilidad(a, b) + probabilidad(b, a)).toBeCloseTo(1, 10);
  });
});
