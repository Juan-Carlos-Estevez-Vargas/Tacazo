import { describe, expect, it } from "vitest";
import { crearAlertas } from "./alertas.js";

describe("alertas", () => {
  it("registra en JSON y avisa al webhook sin repetir ni inundar", async () => {
    let t = 0;
    const lineas: string[] = [];
    const enviados: { url: string; cuerpo: { content: string; text: string } }[] = [];
    const alertar = crearAlertas({
      servicio: "api",
      webhook: "https://discord.example/webhook",
      ahora: () => t,
      log: (l) => lineas.push(l),
      fetch: (async (url: string, init: RequestInit) => {
        enviados.push({ url, cuerpo: JSON.parse(String(init.body)) });
        return new Response(null, { status: 204 });
      }) as unknown as typeof fetch,
    });
    alertar("ruta /monedas", new Error("conexión rechazada"));
    alertar("ruta /monedas", new Error("conexión rechazada"));
    await Promise.all(alertar.pendientes);
    expect(lineas).toHaveLength(2);
    expect(JSON.parse(lineas[0]!)).toMatchObject({
      nivel: "error",
      servicio: "api",
      mensaje: "conexión rechazada",
    });
    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.cuerpo.content).toContain("api · ruta /monedas: conexión rechazada");
    expect(enviados[0]!.cuerpo.text).toBe(enviados[0]!.cuerpo.content);
    // Pasados 10 minutos el mismo error se vuelve a avisar.
    t += 10 * 60_000;
    alertar("ruta /monedas", new Error("conexión rechazada"));
    // Y nunca más de 20 por hora.
    for (let i = 0; i < 40; i++) alertar("ruta", new Error(`error ${i}`));
    await Promise.all(alertar.pendientes);
    expect(enviados).toHaveLength(20);
  });

  it("sin webhook solo escribe el log, y un webhook caído no rompe nada", async () => {
    const lineas: string[] = [];
    crearAlertas({ servicio: "x", log: (l) => lineas.push(l) })("c", "texto");
    expect(lineas).toHaveLength(1);
    const caido = crearAlertas({
      servicio: "x",
      webhook: "https://x",
      log: () => {},
      fetch: (async () => {
        throw new Error("red");
      }) as typeof fetch,
    });
    caido("c", new Error("e"));
    await Promise.all(caido.pendientes);
  });
});
