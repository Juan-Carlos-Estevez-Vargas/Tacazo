import { describe, expect, it } from "vitest";
import { Cubeta, LimitePorClave } from "./limite.js";
import { firmarToken, leerToken } from "./token.js";

const SECRETO = "s".repeat(32);
const datos = { sala: "abc", jugador: 1 as const, nombre: "Beto", vence: 2000 };

describe("token de partida", () => {
  it("se lee si la firma es buena y no venció", () => {
    expect(leerToken(firmarToken(datos, SECRETO), SECRETO, 1000)).toEqual(datos);
  });

  it("se rechaza vencido, con otro secreto o alterado", () => {
    const t = firmarToken(datos, SECRETO);
    expect(leerToken(t, SECRETO, 3000)).toBeNull();
    expect(leerToken(t, "x".repeat(32), 1000)).toBeNull();
    const [cuerpo, firma] = t.split(".");
    const otro = Buffer.from(JSON.stringify({ ...datos, jugador: 0 })).toString("base64url");
    expect(leerToken(`${otro}.${firma}`, SECRETO, 1000)).toBeNull();
    expect(leerToken(`${cuerpo}`, SECRETO, 1000)).toBeNull();
    expect(leerToken(`${cuerpo}.${firma}.x`, SECRETO, 1000)).toBeNull();
    expect(leerToken("basura", SECRETO, 1000)).toBeNull();
  });
});

describe("límites", () => {
  it("la cubeta aguanta la ráfaga y se rellena con el tiempo", () => {
    const c = new Cubeta(10, 5, 0);
    for (let i = 0; i < 5; i++) expect(c.tomar(0)).toBe(true);
    expect(c.tomar(0)).toBe(false);
    expect(c.tomar(100)).toBe(true);
    expect(c.tomar(100)).toBe(false);
  });

  it("el límite por clave se reinicia en cada ventana", () => {
    const l = new LimitePorClave(2, 1000);
    expect([l.permitir("ip", 0), l.permitir("ip", 1), l.permitir("ip", 2)]).toEqual([true, true, false]);
    expect(l.permitir("otra", 2)).toBe(true);
    expect(l.permitir("ip", 1000)).toBe(true);
  });
});
