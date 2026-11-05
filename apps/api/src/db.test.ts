import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comoJugador, comoServidor, type Base, type Consulta } from "./db.js";
import { leerMigraciones, migrar } from "./migrar.js";
import { MINIMO_TABLA, registrarPartida, tablaAmigos, tablaGlobal, tablaPais } from "./ranking.js";
import { baseEnMemoria } from "./prueba-db.js";

let base: Base;

const nuevoJugador = async (nombre: string, pais: string | null = "CO") =>
  comoServidor(base, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      "INSERT INTO jugadores (nombre, pais) VALUES ($1, $2) RETURNING id",
      [nombre, pais],
    );
    return rows[0]!.id;
  });

const jugar = (a: string, b: string, ganador: string, clasificatoria = true) =>
  comoServidor(base, (c) =>
    registrarPartida(c, {
      modo: "bola8",
      sala: "barrio",
      a,
      b,
      ganador,
      motivo: null,
      clasificatoria,
      motor: 2,
      repeticion: { formato: 1 },
    }),
  );

beforeAll(async () => {
  base = await baseEnMemoria();
  const hechas = await migrar(base, await leerMigraciones());
  expect(hechas.length).toBeGreaterThan(0);
}, 30_000);

afterAll(() => base.cerrar());

describe("migraciones", () => {
  it("no repite las ya aplicadas", async () => {
    expect(await migrar(base, await leerMigraciones())).toEqual([]);
  });

  it("se niega si una aplicada cambió o si llega una con fecha anterior", async () => {
    const [m] = await leerMigraciones();
    await expect(migrar(base, [{ ...m!, sql: m!.sql + "\n-- cambio", huella: "otra" }])).rejects.toThrow(
      /cambió/,
    );
    await expect(
      migrar(base, [
        { version: "20200101_01", archivo: "20200101_01_vieja.sql", sql: "SELECT 1", huella: "x" },
      ]),
    ).rejects.toThrow(/anterior/);
  });

  it("rechaza nombres de archivo que no siguen el formato", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mig-"));
    await writeFile(join(dir, "inicial.sql"), "SELECT 1");
    await expect(leerMigraciones(dir + "/")).rejects.toThrow(/inválido/);
  });
});

describe("seguridad por fila", () => {
  let ana: string;
  let beto: string;
  let caro: string;

  beforeAll(async () => {
    ana = await nuevoJugador("Ana");
    beto = await nuevoJugador("Beto");
    caro = await nuevoJugador("Caro");
    await jugar(ana, beto, ana);
  });

  it("cada quien ve solo sus partidas", async () => {
    const ver = (j: string) =>
      comoJugador(base, j, async (c) => (await c.query("SELECT id FROM partidas WHERE true")).rows.length);
    expect(await ver(ana)).toBe(1);
    expect(await ver(beto)).toBe(1);
    expect(await ver(caro)).toBe(0);
    expect(
      await comoJugador(base, null, async (c) => (await c.query("SELECT id FROM partidas")).rows.length),
    ).toBe(0);
  });

  it("nadie cambia el nombre de otro ni lee el identificador de cuenta", async () => {
    const renombrar = (yo: string, a: string) =>
      comoJugador(
        base,
        yo,
        async (c) =>
          (await c.query("UPDATE jugadores SET nombre = 'X' WHERE id = $1 RETURNING id", [a])).rows.length,
      );
    expect(await renombrar(caro, ana)).toBe(0);
    expect(await renombrar(ana, ana)).toBe(1);
    await expect(comoJugador(base, ana, (c) => c.query("SELECT cuenta FROM jugadores"))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("la API no puede escribir ratings ni partidas", async () => {
    await expect(
      comoJugador(base, ana, (c) => c.query("UPDATE ratings SET r = 3000 WHERE jugador = $1", [ana])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      comoJugador(base, ana, (c) =>
        c.query(
          "INSERT INTO partidas (modo, sala, jugador_a, jugador_b, motor, repeticion) VALUES ('bola8','x',$1,$2,2,'{}')",
          [ana, beto],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("solo se crean amistades propias", async () => {
    const [x, y] = ana < caro ? [ana, caro] : [caro, ana];
    const [p, q] = beto < caro ? [beto, caro] : [caro, beto];
    await comoJugador(base, ana, (c) => c.query("INSERT INTO amistades (a, b) VALUES ($1, $2)", [x, y]));
    await expect(
      comoJugador(base, ana, (c) => c.query("INSERT INTO amistades (a, b) VALUES ($1, $2)", [p, q])),
    ).rejects.toThrow(/row-level security/);
  });

  it("rechaza un jugador que no es un uuid", async () => {
    await expect(comoJugador(base, "'; DROP TABLE jugadores; --", async () => 1)).rejects.toThrow(/inválido/);
  });
});

describe("ranking", () => {
  it("una clasificatoria mueve el rating y una amistosa no", async () => {
    const a = await nuevoJugador("Dani");
    const b = await nuevoJugador("Eli");
    const r = await jugar(a, b, a);
    expect(r.ratings![a]!.r).toBeGreaterThan(1500);
    expect(r.ratings![b]!.r).toBeLessThan(1500);
    const amistosa = await jugar(a, b, b, false);
    expect(amistosa.ratings).toBeNull();
    const partidas = await base.query<{ partidas: number }>(
      "SELECT partidas FROM ratings WHERE jugador = $1 AND modo = 'bola8'",
      [a],
    );
    expect(partidas.rows[0]!.partidas).toBe(1);
  });

  it("rechaza ganadores ajenos a la partida", async () => {
    const a = await nuevoJugador("Fer");
    const b = await nuevoJugador("Gabi");
    const c = await nuevoJugador("Hugo");
    await expect(jugar(a, b, c)).rejects.toThrow(/ajeno/);
  });

  it("arma las tablas global, por país y de amigos", async () => {
    const fuerte = await nuevoJugador("Fuerte", "MX");
    const medio = await nuevoJugador("Medio", "CO");
    const flojo = await nuevoJugador("Flojo", "CO");
    for (let i = 0; i < MINIMO_TABLA; i++) {
      await jugar(fuerte, medio, fuerte);
      await jugar(medio, flojo, medio);
      await jugar(fuerte, flojo, fuerte);
    }
    const global = await comoJugador(base, null, (c: Consulta) => tablaGlobal(c, "bola8"));
    expect(global.map((f) => f.nombre)).toEqual(["Fuerte", "Medio", "Flojo"]);
    expect(global[0]!.puesto).toBe(1);

    const co = await comoJugador(base, null, (c) => tablaPais(c, "bola8", "CO"));
    expect(co.map((f) => f.nombre)).toEqual(["Medio", "Flojo"]);
    await expect(comoJugador(base, null, (c) => tablaPais(c, "bola8", "co'--"))).rejects.toThrow(/País/);

    const [x, y] = flojo < fuerte ? [flojo, fuerte] : [fuerte, flojo];
    await comoJugador(base, flojo, (c) => c.query("INSERT INTO amistades (a, b) VALUES ($1, $2)", [x, y]));
    const amigos = await comoJugador(base, flojo, (c) => tablaAmigos(c, "bola8"));
    expect(amigos.map((f) => f.nombre)).toEqual(["Fuerte", "Flojo"]);
  }, 30_000);
});
