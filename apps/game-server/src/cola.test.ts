import { randomBytes } from "node:crypto";
import { firmarInvitado } from "@tacazo/api/cuentas";
import { comoModeracion, abrirRevision, sancionar } from "@tacazo/api/moderacion";
import { comoServidor, type Base } from "@tacazo/api/db";
import { leerMigraciones, migrar } from "@tacazo/api/migrar";
import { comoMonedas, darBienvenida, mover, saldo } from "@tacazo/api/monedas";
import { datosPg, type Datos } from "@tacazo/api/partidas";
import { baseEnMemoria } from "@tacazo/api/prueba-db";
import type { MensajeServidor } from "@tacazo/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Conexion, Reloj } from "./sala.js";
import { COLA_SIN_VER_MS, ServidorPartidas } from "./servidor.js";

class RelojFalso implements Reloj {
  t = 1_000_000;
  private tareas: { en: number; fn: () => void; vivo: boolean }[] = [];
  ahora = () => this.t;
  programar(ms: number, fn: () => void) {
    const tarea = { en: this.t + ms, fn, vivo: true };
    this.tareas.push(tarea);
    return () => {
      tarea.vivo = false;
    };
  }
  avanzar(ms: number) {
    const fin = this.t + ms;
    for (;;) {
      const prox = this.tareas.filter((x) => x.vivo && x.en <= fin).sort((a, b) => a.en - b.en)[0];
      if (!prox) break;
      this.t = prox.en;
      prox.vivo = false;
      prox.fn();
    }
    this.t = fin;
  }
}

const conexion = (): Conexion & { recibidos: MensajeServidor[] } => {
  const recibidos: MensajeServidor[] = [];
  return { recibidos, enviar: (m) => recibidos.push(m), cerrar: () => undefined };
};

// Clave al azar en cada corrida: ninguna clave queda escrita en el repo.
const SECRETO = randomBytes(24).toString("hex");
let base: Base;
let servidor: ServidorPartidas;
let url: string;
const reloj = new RelojFalso();

const nuevoJugador = (nombre: string, region = "sa") =>
  comoServidor(base, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      "INSERT INTO jugadores (nombre, region) VALUES ($1, $2) RETURNING id",
      [nombre, region],
    );
    const id = rows[0]!.id;
    return { id, token: firmarInvitado(id, Date.now() + 3_600_000 + reloj.t, SECRETO) };
  }).then(async (j) => {
    await comoMonedas(base, (c) => darBienvenida(c, j.id));
    return j;
  });

const saldoDe = (j: string) => comoMonedas(base, (c) => saldo(c, j));
/** Gasta monedas por fuera de la cola (como si comprara algo en otra pestaña). */
const gastar = (j: string, monto: number) =>
  comoMonedas(base, (c) =>
    mover(c, {
      clave: `gasto:${j}:${monto}`,
      tipo: "compra",
      asientos: [
        { jugador: j, monto: -monto },
        { sistema: "tienda", monto },
      ],
    }),
  );

const cola = (metodo: "GET" | "POST" | "DELETE", token?: string, cuerpo?: unknown) =>
  fetch(`${url}/cola`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });

beforeAll(async () => {
  base = await baseEnMemoria();
  await migrar(base, await leerMigraciones());
  servidor = new ServidorPartidas({ secreto: SECRETO, origenes: [], reloj, datos: datosPg(base) });
  url = `http://127.0.0.1:${await servidor.escuchar(0, "127.0.0.1")}`;
}, 30_000);

afterAll(async () => {
  await servidor.cerrar();
  await base.cerrar();
});

describe("cola clasificatoria", () => {
  it("pide sesión y valida modo y sala", async () => {
    expect((await cola("POST", undefined, { modo: "bola8", sala: "barrio" })).status).toBe(401);
    expect((await cola("POST", "inv.falso.1.x", { modo: "bola8", sala: "barrio" })).status).toBe(401);
    const { token } = await nuevoJugador("Val");
    expect((await cola("POST", token, { modo: "snooker", sala: "barrio" })).status).toBe(400);
    expect((await cola("GET", token)).status).toBe(200);
  });

  it("empareja, juega y guarda la partida con su rating", async () => {
    const ana = await nuevoJugador("Ana");
    const beto = await nuevoJugador("Beto");
    expect((await cola("POST", ana.token, { modo: "bola8", sala: "barrio" })).status).toBe(202);
    reloj.avanzar(2000);
    expect((await cola("POST", beto.token, { modo: "bola8", sala: "barrio" })).status).toBe(202);
    expect(servidor.emparejar()).toBe(1);
    await Promise.all(servidor.cobrando);
    expect(await saldoDe(ana.id)).toBe(450);

    const ea = (await (await cola("GET", ana.token)).json()) as {
      estado: string;
      sala: string;
      jugador: number;
      rival: string;
    };
    const eb = (await (await cola("GET", beto.token)).json()) as {
      estado: string;
      sala: string;
      jugador: number;
    };
    expect(ea).toMatchObject({ estado: "emparejado", jugador: 0, rival: "Beto" });
    expect(eb).toMatchObject({ estado: "emparejado", jugador: 1, sala: ea.sala });
    // Volver a pedir cola mientras la partida sigue devuelve la misma partida.
    expect(await (await cola("POST", ana.token, { modo: "bola8", sala: "barrio" })).json()).toMatchObject({
      sala: ea.sala,
    });

    // Los dos se conectan; Beto se va y pierde por abandono a los 60 s.
    const sala = servidor.salas.get(ea.sala)!;
    const ca = conexion();
    const cb = conexion();
    sala.conectar(0, ca);
    sala.conectar(1, cb);
    sala.desconectar(1, cb);
    reloj.avanzar(61_000);
    expect(sala.estadoFase).toBe("terminada");
    await Promise.all(servidor.guardando);

    const filas = await comoServidor(base, async (c) => {
      const p = await c.query<{ ganador: string; clasificatoria: boolean }>(
        "SELECT ganador, clasificatoria FROM partidas WHERE $1 IN (jugador_a, jugador_b)",
        [ana.id],
      );
      const r = await c.query<{ jugador: string; r: number }>(
        "SELECT jugador, r FROM ratings WHERE jugador IN ($1, $2)",
        [ana.id, beto.id],
      );
      return { p: p.rows, r: Object.fromEntries(r.rows.map((x) => [x.jugador, x.r])) };
    });
    expect(filas.p).toEqual([{ ganador: ana.id, clasificatoria: true }]);
    expect(filas.r[ana.id]).toBeGreaterThan(1500);
    expect(filas.r[beto.id]).toBeLessThan(1500);
    // Ana ganó la sala barrio: 500 − 50 + 90. Beto perdió su entrada.
    expect(await saldoDe(ana.id)).toBe(540);
    expect(await saldoDe(beto.id)).toBe(450);
    // Al terminar ya no figuran como emparejados.
    expect(await (await cola("GET", ana.token)).json()).toEqual({ estado: "nada" });
  });

  it("no vuelve a emparejar enseguida a los mismos rivales", async () => {
    const [c1, c2] = [await nuevoJugador("Caro"), await nuevoJugador("Dani")];
    await comoServidor(base, (c) =>
      c.query(
        "INSERT INTO partidas (modo, sala, jugador_a, jugador_b, ganador, motor, repeticion, clasificatoria) VALUES ('bola8','barrio',$1,$2,$1,2,'{}',true)",
        [c1.id, c2.id],
      ),
    );
    await cola("POST", c1.token, { modo: "bola8", sala: "barrio" });
    await cola("POST", c2.token, { modo: "bola8", sala: "barrio" });
    expect(servidor.emparejar()).toBe(0);
    await Promise.all(servidor.cobrando);
    await cola("DELETE", c1.token);
    await cola("DELETE", c2.token);
    expect(await (await cola("GET", c1.token)).json()).toEqual({ estado: "nada" });
  });

  it("saca de la cola a quien deja de preguntar", async () => {
    const e = await nuevoJugador("Eli");
    await cola("POST", e.token, { modo: "bola8", sala: "barrio" });
    reloj.avanzar(COLA_SIN_VER_MS + 1);
    servidor.emparejar();
    expect(await (await cola("GET", e.token)).json()).toEqual({ estado: "nada" });
  });

  it("no deja entrar a jugadores sancionados", async () => {
    const f = await nuevoJugador("Fer");
    for (let i = 0; i < 2; i++) {
      const r = await comoModeracion(base, (c) => abrirRevision(c, f.id, "senales", [], 2, []));
      await comoModeracion(base, (c) => sancionar(c, r, "mod", "Tiempos de máquina"));
    }
    const r = await cola("POST", f.token, { modo: "bola8", sala: "barrio" });
    expect(r.status).toBe(403);
    expect(((await r.json()) as { error: string }).error).toMatch(/clasificatorias/);
  });

  it("no deja entrar a una sala que no puede pagar", async () => {
    const g = await nuevoJugador("Gus");
    const r = await cola("POST", g.token, { modo: "bola8", sala: "campeonato" });
    expect(r.status).toBe(409);
    expect(((await r.json()) as { error: string }).error).toMatch(/1000/);
    expect((await cola("POST", g.token, { modo: "bola8", sala: "club" })).status).toBe(202);
    await cola("DELETE", g.token);
  });

  it("si a uno ya no le alcanza al emparejar, sale con aviso y el otro sigue buscando", async () => {
    const h = await nuevoJugador("Hana");
    const i = await nuevoJugador("Iván");
    await cola("POST", h.token, { modo: "bola8", sala: "club" });
    await cola("POST", i.token, { modo: "bola8", sala: "club" });
    await gastar(i.id, 400);
    expect(servidor.emparejar()).toBe(1);
    await Promise.all(servidor.cobrando);
    expect(await (await cola("GET", i.token)).json()).toEqual({
      estado: "nada",
      motivo: "No te alcanzan las monedas para esta sala",
    });
    expect(await (await cola("GET", h.token)).json()).toEqual({ estado: "buscando" });
    // A nadie se le cobró nada.
    expect(await saldoDe(h.id)).toBe(500);
    expect(await saldoDe(i.id)).toBe(100);
    await cola("DELETE", h.token);
  });
});

describe("cobro de entradas", () => {
  it("devuelve las dos entradas si alguien cancela mientras se cobra", async () => {
    const real = datosPg(base);
    let soltar = () => {};
    const espera = new Promise<void>((ok) => (soltar = ok));
    const datos: Datos = {
      ...real,
      cobrar: async (...args) => {
        await espera;
        return real.cobrar(...args);
      },
    };
    const otro = new ServidorPartidas({ secreto: SECRETO, origenes: [], reloj, datos });
    const u = `http://127.0.0.1:${await otro.escuchar(0, "127.0.0.1")}/cola`;
    const pedir = (metodo: string, token: string, cuerpo?: unknown) =>
      fetch(u, {
        method: metodo,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
      });
    const k = await nuevoJugador("Kata");
    const l = await nuevoJugador("Leo");
    await pedir("POST", k.token, { modo: "bola8", sala: "club" });
    await pedir("POST", l.token, { modo: "bola8", sala: "club" });
    expect(otro.emparejar()).toBe(1);
    // Mientras se cobran las entradas, para ellos sigue "buscando".
    expect(await (await pedir("GET", k.token)).json()).toEqual({ estado: "buscando" });
    expect(await (await pedir("DELETE", l.token)).json()).toEqual({ estado: "nada" });
    soltar();
    await Promise.all(otro.cobrando);
    expect(await saldoDe(k.id)).toBe(500);
    expect(await saldoDe(l.id)).toBe(500);
    // Kata vuelve a la cola; Leo quedó fuera.
    expect(await (await pedir("GET", k.token)).json()).toEqual({ estado: "buscando" });
    expect(await (await pedir("GET", l.token)).json()).toEqual({ estado: "nada" });
    await otro.cerrar();
  });
});
