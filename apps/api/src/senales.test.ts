import { verificarRepeticion } from "@tacazo/core";
import { describe, expect, it } from "vitest";
import { partida } from "./prueba-partidas.js";
import { evaluar, muestrasVacias, muestrear, umbralesDe, UMBRALES_EJEMPLO } from "./senales.js";

describe("señales anti-trampas", () => {
  // Humano simulado: tiempos variados. Máquina: siempre igual tras la animación.
  const humano = (_: 0 | 1, i: number) => 4000 + ((i * 7919) % 9000);
  const reps = Array.from({ length: 6 }, (_, k) =>
    partida(100 + k, ["dificil", "facil"], (j, i, anim) => (j === 0 ? anim + 1200 : anim + humano(j, i))),
  );

  it("las repeticiones de prueba son válidas", () => {
    for (const r of reps) expect(verificarRepeticion(r).ok).toBe(true);
  });

  it("el bot difícil apunta mucho más fino que el fácil", () => {
    const fino = muestrasVacias();
    const torpe = muestrasVacias();
    for (const r of reps) {
      muestrear(r, 0, fino);
      muestrear(r, 1, torpe);
    }
    expect(fino.errores.length).toBeGreaterThan(5);
    const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1]!;
    expect(med(fino.errores)).toBeLessThan(med(torpe.errores));
    expect(fino.tiempos.length).toBeGreaterThan(0);
  });

  it("marca tiempos de máquina y deja en paz los humanos", () => {
    const u = { ...UMBRALES_EJEMPLO, minTiempos: 10, minTiros: 1000, minDificiles: 1000 };
    const maquina = muestrasVacias();
    const persona = muestrasVacias();
    for (const r of reps) {
      muestrear(r, 0, maquina);
      muestrear(r, 1, persona);
    }
    // La máquina tira 1,2 s después de que termina la animación, siempre.
    const em = evaluar(maquina, u);
    expect(em.senales.map((s) => s.clave)).toEqual(["tiempo"]);
    expect(evaluar(persona, u).senales).toEqual([]);
  });

  it("pide revisión solo cuando se juntan varias señales", () => {
    const m = {
      errores: Array(30).fill(0.01),
      dificiles: 20,
      dificilesMetidas: 19,
      tiempos: Array(30).fill(900),
    };
    const e = evaluar(m, UMBRALES_EJEMPLO);
    expect(e.senales.map((s) => s.clave)).toEqual(["punteria", "cortes", "tiempo"]);
    expect(e.revisar).toBe(true);
    const una = evaluar(
      { ...m, dificilesMetidas: 5, tiempos: m.tiempos.map((_, i) => i * 400) },
      UMBRALES_EJEMPLO,
    );
    expect(una.puntaje).toBe(1);
    expect(una.revisar).toBe(false);
    // Con pocas muestras no se opina.
    expect(
      evaluar({ errores: [0], dificiles: 1, dificilesMetidas: 1, tiempos: [1] }, UMBRALES_EJEMPLO).puntaje,
    ).toBe(0);
  });

  it("lee umbrales privados y rechaza valores raros", () => {
    expect(umbralesDe(undefined)).toBe(UMBRALES_EJEMPLO);
    expect(umbralesDe('{"tasaDificiles":0.9}').tasaDificiles).toBe(0.9);
    expect(umbralesDe('{"tasaDificiles":0.9}').minTiros).toBe(UMBRALES_EJEMPLO.minTiros);
    expect(() => umbralesDe('{"minTiros":"20"}')).toThrow(/inválido/);
  });
});
