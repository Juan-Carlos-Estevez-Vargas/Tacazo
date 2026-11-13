import { ENGINE_VERSION, PROTOCOLO, type MensajeServidor } from "@tacazo/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { ServidorPartidas, limpiarNombre } from "./servidor.js";

const ORIGEN = "http://localhost:5173";
let servidor: ServidorPartidas;
let base: string;

beforeAll(async () => {
  servidor = new ServidorPartidas({ secreto: "k".repeat(32), origenes: [ORIGEN] });
  const puerto = await servidor.escuchar(0, "127.0.0.1");
  base = `127.0.0.1:${puerto}`;
});
afterAll(() => servidor.cerrar());

const post = (ruta: string, cuerpo: unknown = {}) =>
  fetch(`http://${base}${ruta}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGEN },
    body: JSON.stringify(cuerpo),
  });

/** Cliente de prueba que guarda lo que recibe y deja esperar un tipo de mensaje. */
function cliente(origen = ORIGEN) {
  const ws = new WebSocket(`ws://${base}/ws`, { headers: { origin: origen } });
  const recibidos: MensajeServidor[] = [];
  const esperando: { t: string; ok: (m: MensajeServidor) => void }[] = [];
  ws.on("message", (d) => {
    const m = JSON.parse(String(d)) as MensajeServidor;
    recibidos.push(m);
    const i = esperando.findIndex((e) => e.t === m.t);
    if (i >= 0) esperando.splice(i, 1)[0]!.ok(m);
  });
  const cerrado = new Promise<number>((ok) => ws.on("close", (c) => ok(c)));
  const abierto = new Promise<void>((ok, mal) => {
    ws.on("open", () => ok());
    ws.on("unexpected-response", (_, res) => mal(new Error(String(res.statusCode))));
    ws.on("error", mal);
  });
  const esperar = <T extends MensajeServidor["t"]>(t: T) =>
    new Promise<Extract<MensajeServidor, { t: T }>>((ok) => {
      const ya = recibidos.find((m) => m.t === t);
      if (ya) {
        recibidos.splice(recibidos.indexOf(ya), 1);
        ok(ya as Extract<MensajeServidor, { t: T }>);
      } else esperando.push({ t, ok: ok as (m: MensajeServidor) => void });
    });
  return { ws, abierto, cerrado, esperar, enviar: (x: unknown) => ws.send(JSON.stringify(x)) };
}

describe("servidor de partidas", () => {
  it("responde a /salud", async () => {
    const r = await fetch(`http://${base}/salud`);
    expect(await r.json()).toMatchObject({
      ok: true,
      motor: ENGINE_VERSION,
      protocolo: PROTOCOLO,
      salas: expect.any(Number),
      enCola: 0,
      memoriaMB: expect.any(Number),
    });
  });

  it("crea una sala, deja unirse a un invitado y juega un tiro por WebSocket", async () => {
    const r1 = await post("/salas", { nombre: "Ana" });
    expect(r1.status).toBe(201);
    expect(r1.headers.get("access-control-allow-origin")).toBe(ORIGEN);
    const { sala, token: t0 } = (await r1.json()) as { sala: string; token: string };
    const r2 = await post(`/salas/${sala}/unirse`, { nombre: "Beto" });
    const { token: t1, jugador } = (await r2.json()) as { token: string; jugador: number };
    expect(jugador).toBe(1);
    expect((await post(`/salas/${sala}/unirse`, {})).status).toBe(409);

    const a = cliente();
    const b = cliente();
    await Promise.all([a.abierto, b.abierto]);
    a.enviar({ t: "saludo", token: t0, cliente: PROTOCOLO, motor: ENGINE_VERSION });
    expect((await a.esperar("bienvenida")).jugador).toBe(0);
    b.enviar({ t: "saludo", token: t1, cliente: PROTOCOLO, motor: ENGINE_VERSION });
    expect((await b.esperar("bienvenida")).jugador).toBe(1);

    a.enviar({ t: "tirar", seq: 1, tiro: { angle: 0, power: 0.9, side: 0, top: 0, elevation: 0 } });
    const [ra, rb] = await Promise.all([a.esperar("resultado"), b.esperar("resultado")]);
    expect(ra.hash).toBe(rb.hash);

    const rep = (await (await fetch(`http://${base}/salas/${sala}/repeticion`)).json()) as {
      entradas: unknown[];
    };
    expect(rep.entradas).toHaveLength(1);
    a.ws.close();
    b.ws.close();
  });

  it("rechaza una versión vieja del motor con aviso de actualizar", async () => {
    const { token } = (await (await post("/salas")).json()) as { token: string };
    const c = cliente();
    await c.abierto;
    c.enviar({ t: "saludo", token, cliente: PROTOCOLO, motor: ENGINE_VERSION - 1 });
    const e = await c.esperar("error");
    expect(e.codigo).toBe("version");
    expect(await c.cerrado).toBe(4002);
  });

  it("rechaza un token falso", async () => {
    const c = cliente();
    await c.abierto;
    c.enviar({ t: "saludo", token: "abc.def", cliente: PROTOCOLO, motor: ENGINE_VERSION });
    expect((await c.esperar("error")).codigo).toBe("token");
    expect(await c.cerrado).toBe(4001);
  });

  it("exige saludar primero", async () => {
    const c = cliente();
    await c.abierto;
    c.enviar({ t: "apuntar", angulo: 1 });
    expect(await c.cerrado).toBe(4001);
  });

  it("corta a quien manda demasiados mensajes", async () => {
    const c = cliente();
    await c.abierto;
    for (let i = 0; i < 60; i++) c.enviar({ t: "nada" });
    expect(await c.cerrado).toBe(4008);
  });

  it("no acepta WebSocket desde otro origen", async () => {
    const c = cliente("https://malo.example");
    await expect(c.abierto).rejects.toThrow("403");
  });

  it("no acepta cuerpos HTTP grandes ni salas inexistentes", async () => {
    expect((await post("/salas", { nombre: "x".repeat(5000) })).status).toBe(400);
    expect((await post("/salas/nada/unirse")).status).toBe(404);
  });

  it("limpia los nombres", () => {
    expect(limpiarNombre("  <b>Ana</b>\u0007 ")).toBe("bAna/b");
    expect(limpiarNombre(42)).toBe("Invitado");
    expect(limpiarNombre("x".repeat(40))).toHaveLength(20);
  });
});
