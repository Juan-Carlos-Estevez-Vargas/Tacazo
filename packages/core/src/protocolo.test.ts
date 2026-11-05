import { describe, expect, it } from "vitest";
import { MAX_MENSAJE, leerMensajeCliente } from "./protocolo.js";

const tiro = { angle: 0.5, power: 0.6, side: 0.2, top: -0.3, elevation: 0 };
const leer = (x: unknown) => leerMensajeCliente(JSON.stringify(x));

describe("protocolo", () => {
  it("acepta mensajes bien formados", () => {
    expect(leer({ t: "saludo", token: "abc", cliente: 1, motor: 2 }).ok).toBe(true);
    expect(leer({ t: "apuntar", angulo: 1.2 }).ok).toBe(true);
    const r = leer({ t: "tirar", seq: 1, tiro, cantar: 3, blanca: { x: 0.5, y: 0.6 } });
    expect(r).toEqual({ ok: true, msg: { t: "tirar", seq: 1, tiro, cantar: 3, blanca: { x: 0.5, y: 0.6 } } });
  });

  it.each([
    ["no es JSON", "{"],
    ["no es objeto", "[1]"],
    ["tipo desconocido", JSON.stringify({ t: "trampa" })],
    ["claves de más", JSON.stringify({ t: "apuntar", angulo: 1, extra: 1 })],
    ["ángulo infinito", '{"t":"apuntar","angulo":1e999}'],
    ["potencia fuera de rango", JSON.stringify({ t: "tirar", seq: 1, tiro: { ...tiro, power: 3 } })],
    [
      "efecto fuera de la bola",
      JSON.stringify({ t: "tirar", seq: 1, tiro: { ...tiro, side: 0.9, top: 0.9 } }),
    ],
    ["inclinación de más", JSON.stringify({ t: "tirar", seq: 1, tiro: { ...tiro, elevation: 80 } })],
    ["secuencia no entera", JSON.stringify({ t: "tirar", seq: 1.5, tiro })],
    ["secuencia cero", JSON.stringify({ t: "tirar", seq: 0, tiro })],
    ["tronera rara", JSON.stringify({ t: "tirar", seq: 1, tiro, cantar: -1 })],
    ["blanca como texto", JSON.stringify({ t: "tirar", seq: 1, tiro, blanca: "aquí" })],
    ["tiro con prototipo", '{"t":"tirar","seq":1,"tiro":{"__proto__":{"x":1},"angle":0}}'],
    ["versión en texto", JSON.stringify({ t: "saludo", token: "a", cliente: "1", motor: 2 })],
    ["mensaje enorme", JSON.stringify({ t: "saludo", token: "a".repeat(MAX_MENSAJE), cliente: 1, motor: 1 })],
  ])("rechaza: %s", (_, texto) => {
    expect(leerMensajeCliente(texto).ok).toBe(false);
  });
});
