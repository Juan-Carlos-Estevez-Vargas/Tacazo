import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comoJugador, comoRol, comoServidor, type Base } from "./db.js";
import { leerMigraciones, migrar } from "./migrar.js";
import {
  BIENVENIDA,
  cobrarDiario,
  cobrarEntrada,
  comoMonedas,
  conseguir,
  darBienvenida,
  devolverEntrada,
  devolverHuerfanas,
  ENTRADA_HUERFANA_MS,
  diaLocal,
  flujo,
  inventario,
  mover,
  pagar,
  pagarPremio,
  PREMIO_DIARIO,
  saldo,
  SaldoInsuficiente,
  salaPorId,
  circulacion,
  resumirFlujo,
} from "./monedas.js";
import { baseEnMemoria } from "./prueba-db.js";

let base: Base;
let n = 0;

beforeAll(async () => {
  base = await baseEnMemoria();
  await migrar(base, await leerMigraciones());
}, 30_000);

afterAll(async () => {
  await base.cerrar();
});

const nuevoJugador = (nombre: string) =>
  comoServidor(base, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      "INSERT INTO jugadores (nombre) VALUES ($1) RETURNING id",
      [nombre],
    );
    return rows[0]!.id;
  });

const saldoDe = (j: string) => comoMonedas(base, (c) => saldo(c, j));
const barrio = salaPorId("barrio")!;
const club = salaPorId("club")!;

describe("libro de monedas", () => {
  it("da la bienvenida una sola vez", async () => {
    const j = await nuevoJugador("Ana");
    expect(await comoMonedas(base, (c) => darBienvenida(c, j))).toBe(true);
    expect(await comoMonedas(base, (c) => darBienvenida(c, j))).toBe(false);
    expect(await saldoDe(j)).toBe(BIENVENIDA);
  });

  it("paga el premio diario una vez por día local", async () => {
    const j = await nuevoJugador("Beto");
    // 04:59 UTC sigue siendo el día anterior en Colombia.
    const noche = Date.UTC(2026, 10, 10, 4, 59);
    const manana = Date.UTC(2026, 10, 10, 5, 1);
    expect(diaLocal(noche)).toBe("2026-11-09");
    expect(diaLocal(manana)).toBe("2026-11-10");
    expect(await comoMonedas(base, (c) => cobrarDiario(c, j, noche))).toBe(true);
    expect(await comoMonedas(base, (c) => cobrarDiario(c, j, noche - 3_600_000))).toBe(false);
    expect(await comoMonedas(base, (c) => cobrarDiario(c, j, manana))).toBe(true);
    expect(await saldoDe(j)).toBe(2 * PREMIO_DIARIO);
  });

  it("rechaza movimientos que no cuadran o con montos raros", async () => {
    const j = await nuevoJugador("Caro");
    const intento = (asientos: Parameters<typeof mover>[1]["asientos"]) =>
      comoMonedas(base, (c) => mover(c, { clave: `raro:${j}:${++n}`, tipo: "ajuste", asientos }));
    await expect(intento([{ jugador: j, monto: 10 }])).rejects.toThrow(/dos asientos/);
    await expect(
      intento([
        { jugador: j, monto: 10 },
        { sistema: "emision", monto: -9 },
      ]),
    ).rejects.toThrow(/suma cero/);
    await expect(intento(pagar(j, 0.5, "emision"))).rejects.toThrow(/Monto/);
    await expect(intento(pagar(j, 0, "emision"))).rejects.toThrow(/Monto/);
    expect(await saldoDe(j)).toBe(0);
  });

  it("la base también rechaza un movimiento descuadrado escrito a mano", async () => {
    await expect(
      comoMonedas(base, async (c) => {
        const { rows } = await c.query<{ id: string }>(
          "INSERT INTO movimientos (clave, tipo) VALUES ('a-mano', 'ajuste') RETURNING id",
        );
        await c.query("INSERT INTO asientos (movimiento, sistema, monto) VALUES ($1, 'emision', 5)", [
          rows[0]!.id,
        ]);
      }),
    ).rejects.toThrow(/no suma cero/);
  });

  it("no deja a nadie en negativo y deshace todo el movimiento", async () => {
    const j = await nuevoJugador("Dani");
    await expect(comoMonedas(base, (c) => cobrarEntrada(c, "p-sin-plata", j, barrio))).rejects.toThrow(
      SaldoInsuficiente,
    );
    // La clave no quedó gastada: con saldo, el mismo cobro sí pasa.
    await comoMonedas(base, (c) => darBienvenida(c, j));
    expect(await comoMonedas(base, (c) => cobrarEntrada(c, "p-sin-plata", j, barrio))).toBe(true);
    expect(await saldoDe(j)).toBe(BIENVENIDA - barrio.entrada);
  });

  it("no se puede editar ni borrar el libro", async () => {
    const j = await nuevoJugador("Eli");
    await comoMonedas(base, (c) => darBienvenida(c, j));
    // Ni siquiera el dueño de las tablas puede reescribir la historia.
    await expect(
      base.transaccion((c) => c.query("UPDATE asientos SET monto = 1000000 WHERE jugador = $1", [j])),
    ).rejects.toThrow(/no se edita/);
    await expect(
      base.transaccion((c) => c.query("DELETE FROM movimientos WHERE clave = $1", [`bienvenida:${j}`])),
    ).rejects.toThrow(/no se edita/);
    expect(await saldoDe(j)).toBe(BIENVENIDA);
  });

  it("cobra entradas, paga premio al ganador y retira el resto", async () => {
    const a = await nuevoJugador("Fer");
    const b = await nuevoJugador("Gabi");
    for (const j of [a, b]) await comoMonedas(base, (c) => darBienvenida(c, j));
    await comoMonedas(base, async (c) => {
      await cobrarEntrada(c, "p1", a, club);
      await cobrarEntrada(c, "p1", b, club);
    });
    expect(await comoMonedas(base, (c) => pagarPremio(c, "p1", a, club))).toBe(true);
    expect(await comoMonedas(base, (c) => pagarPremio(c, "p1", a, club))).toBe(false);
    expect(await saldoDe(a)).toBe(BIENVENIDA - club.entrada + club.premio);
    expect(await saldoDe(b)).toBe(BIENVENIDA - club.entrada);
    // La mesa se quedó con el sumidero: dos entradas menos el premio.
    const mesa = await comoMonedas(base, async (c) => {
      const { rows } = await c.query<{ s: string }>(
        "SELECT sum(a.monto) AS s FROM asientos a JOIN movimientos m ON m.id = a.movimiento WHERE a.sistema = 'mesa' AND m.clave LIKE '%:p1%'",
      );
      return Number(rows[0]!.s);
    });
    expect(mesa).toBe(2 * club.entrada - club.premio);
  });

  it("devuelve la entrada una sola vez", async () => {
    const j = await nuevoJugador("Hugo");
    await comoMonedas(base, (c) => darBienvenida(c, j));
    await comoMonedas(base, (c) => cobrarEntrada(c, "p2", j, barrio));
    expect(await comoMonedas(base, (c) => devolverEntrada(c, "p2", j, barrio))).toBe(true);
    expect(await comoMonedas(base, (c) => devolverEntrada(c, "p2", j, barrio))).toBe(false);
    expect(await saldoDe(j)).toBe(BIENVENIDA);
  });

  it("devuelve las entradas que quedaron sin premio ni devolución", async () => {
    const [a, b, c2] = [await nuevoJugador("Ofe"), await nuevoJugador("Pío"), await nuevoJugador("Quim")];
    for (const j of [a, b, c2]) await comoMonedas(base, (c) => darBienvenida(c, j));
    await comoMonedas(base, async (c) => {
      // Partida cortada por un reinicio: nadie cobró nada.
      await cobrarEntrada(c, "cortada", a, barrio);
      await cobrarEntrada(c, "cortada", b, barrio);
      // Partida terminada: ya se pagó el premio.
      await cobrarEntrada(c, "jugada", c2, club);
      await pagarPremio(c, "jugada", c2, club);
    });
    const ahora = Date.now();
    // Recién cobradas: puede que se estén jugando todavía.
    expect(await comoMonedas(base, (c) => devolverHuerfanas(c, ahora))).toBe(0);
    const despues = ahora + ENTRADA_HUERFANA_MS + 60_000;
    // Otras pruebas de este archivo también dejaron entradas sueltas.
    expect(await comoMonedas(base, (c) => devolverHuerfanas(c, despues))).toBeGreaterThanOrEqual(2);
    expect(await comoMonedas(base, (c) => devolverHuerfanas(c, despues))).toBe(0);
    expect(await saldoDe(a)).toBe(BIENVENIDA);
    expect(await saldoDe(b)).toBe(BIENVENIDA);
    expect(await saldoDe(c2)).toBe(BIENVENIDA - club.entrada + club.premio);
  });

  it("cobros simultáneos al mismo jugador no lo dejan en negativo", async () => {
    const j = await nuevoJugador("Iris");
    await comoMonedas(base, (c) => darBienvenida(c, j));
    // 500 monedas alcanzan para 2 entradas de 200, no para 5.
    const intentos = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) => comoMonedas(base, (c) => cobrarEntrada(c, `simul-${i}`, j, club))),
    );
    const bien = intentos.filter((r) => r.status === "fulfilled").length;
    expect(bien).toBe(2);
    expect(await saldoDe(j)).toBe(BIENVENIDA - 2 * club.entrada);
  });

  it("la misma clave enviada a la vez se cobra una sola vez", async () => {
    const j = await nuevoJugador("Juli");
    await comoMonedas(base, (c) => darBienvenida(c, j));
    const r = await Promise.allSettled(
      Array.from({ length: 4 }, () => comoMonedas(base, (c) => cobrarEntrada(c, "doble-toque", j, barrio))),
    );
    expect(r.every((x) => x.status === "fulfilled")).toBe(true);
    expect(await saldoDe(j)).toBe(BIENVENIDA - barrio.entrada);
  });
});

describe("permisos del libro", () => {
  it("un jugador ve solo su saldo y no puede darse monedas", async () => {
    const a = await nuevoJugador("Kike");
    const b = await nuevoJugador("Lu");
    for (const j of [a, b]) await comoMonedas(base, (c) => darBienvenida(c, j));
    const visto = await comoJugador(base, a, async (c) => {
      const s = await c.query<{ jugador: string }>("SELECT jugador FROM saldos");
      const m = await c.query<{ clave: string }>("SELECT clave FROM movimientos");
      return { s: s.rows.map((r) => r.jugador), m: m.rows.map((r) => r.clave) };
    });
    expect(visto.s).toEqual([a]);
    expect(visto.m).toEqual([`bienvenida:${a}`]);
    await expect(comoJugador(base, a, (c) => darBienvenida(c, a))).rejects.toThrow(/permission denied/);
    // El servidor de partidas tampoco mueve monedas con su rol de siempre.
    await expect(comoRol(base, "tacazo_partidas", null, (c) => darBienvenida(c, a))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("cosméticos", () => {
  it("compra con monedas una sola vez y desbloquea por partidas", async () => {
    const j = await nuevoJugador("Mafe");
    await comoMonedas(base, (c) => darBienvenida(c, j));
    await comoMonedas(base, (c) => cobrarDiario(c, j, Date.UTC(2026, 0, 1, 12)));
    expect(await comoMonedas(base, (c) => conseguir(c, j, "taco_laton", 0))).toBe("nuevo");
    expect(await comoMonedas(base, (c) => conseguir(c, j, "taco_laton", 0))).toBe("ya");
    expect(await saldoDe(j)).toBe(BIENVENIDA + PREMIO_DIARIO - 600);
    await expect(comoMonedas(base, (c) => conseguir(c, j, "marco_oro", 0))).rejects.toThrow(
      SaldoInsuficiente,
    );
    await expect(comoMonedas(base, (c) => conseguir(c, j, "marco_bronce", 9))).rejects.toThrow(/10 partidas/);
    expect(await comoMonedas(base, (c) => conseguir(c, j, "marco_bronce", 10))).toBe("nuevo");
    await expect(comoMonedas(base, (c) => conseguir(c, j, "no_existe", 0))).rejects.toThrow(/no existe/);
    const inv = await comoMonedas(base, (c) => inventario(c, j));
    expect(inv).toEqual(expect.arrayContaining(["taco_roble", "taco_laton", "marco_bronce"]));
    expect(inv).not.toContain("marco_oro");
  });
});

describe("panel de fuentes y sumideros", () => {
  it("suma lo que entra y sale por tipo", async () => {
    const filas = await comoMonedas(base, (c) => flujo(c, 3650));
    const hoy = filas.filter((f) => f.tipo === "bienvenida");
    expect(hoy.reduce((s, f) => s + f.entran, 0)).toBeGreaterThanOrEqual(BIENVENIDA * 5);
    const entradas = filas.filter((f) => f.tipo === "entrada");
    expect(entradas.every((f) => f.salen > 0 && f.entran === 0)).toBe(true);
    const r = resumirFlujo(filas);
    const masa = await comoMonedas(base, (c) => circulacion(c));
    // Todo lo que entró menos lo que salió es justo lo que tienen los jugadores.
    expect(r.neto).toBe(masa.total);
    expect(r.tipos[0]!.tipo).toBe("bienvenida");
  });

  it("agrupa por tipo y calcula el neto", () => {
    const r = resumirFlujo([
      { tipo: "diario", entran: 100, salen: 0, movimientos: 1 },
      { tipo: "entrada", entran: 0, salen: 400, movimientos: 2 },
      { tipo: "diario", entran: 300, salen: 0, movimientos: 3 },
    ]);
    expect(r).toEqual({
      tipos: [
        { tipo: "diario", entran: 400, salen: 0, movimientos: 4 },
        { tipo: "entrada", entran: 0, salen: 400, movimientos: 2 },
      ],
      entran: 400,
      salen: 400,
      neto: 0,
    });
  });
});
