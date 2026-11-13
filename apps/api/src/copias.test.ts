import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { revisarCopia } from "./copias.js";
import { comoServidor, type Base } from "./db.js";
import { leerMigraciones, migrar, type Migracion } from "./migrar.js";
import { comoMonedas, darBienvenida } from "./monedas.js";
import { baseEnMemoria } from "./prueba-db.js";

let base: Base;
let vacia: Base;
let migraciones: Migracion[];

beforeAll(async () => {
  migraciones = await leerMigraciones();
  [base, vacia] = await Promise.all([baseEnMemoria(), baseEnMemoria()]);
  await migrar(base, migraciones);
  await migrar(vacia, migraciones);
  const id = await comoServidor(base, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      "INSERT INTO jugadores (nombre) VALUES ('Ana') RETURNING id",
    );
    return rows[0]!.id;
  });
  await comoMonedas(base, (c) => darBienvenida(c, id));
}, 60_000);

afterAll(async () => {
  await Promise.all([base.cerrar(), vacia.cerrar()]);
});

describe("revisión de copias", () => {
  it("una copia completa y cuadrada pasa", async () => {
    const r = await revisarCopia(base, migraciones, base);
    expect(r.problemas).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.filas).toMatchObject({ jugadores: 1, movimientos: 1, asientos: 2 });
  });

  it("avisa si faltan migraciones o datos", async () => {
    const extra = { version: "20991231_01", archivo: "x.sql", sql: "", huella: "x" };
    const r = await revisarCopia(vacia, [...migraciones, extra], base);
    expect(r.ok).toBe(false);
    expect(r.problemas).toEqual(["Falta la migración 20991231_01", "La copia no tiene jugadores"]);
    const alReves = await revisarCopia(base, migraciones, vacia);
    expect(alReves.problemas).toContain("jugadores tiene más filas en la copia (1) que en el origen (0)");
  });

  it("una copia vieja, sin tablas nuevas, no se cae", async () => {
    await vacia.query("ALTER TABLE inventario RENAME TO inventario_x");
    try {
      const r = await revisarCopia(vacia, migraciones);
      expect(r.problemas).toEqual(["Faltan tablas: inventario"]);
      expect(r.filas.inventario).toBe(-1);
    } finally {
      await vacia.query("ALTER TABLE inventario_x RENAME TO inventario");
    }
  });

  it("avisa si los libros de monedas no cuadran", async () => {
    // Un asiento suelto, saltándose los disparadores, como si la copia viniera rota.
    await vacia.transaccion(async (c) => {
      await c.query("SET LOCAL session_replication_role = replica");
      const { rows } = await c.query<{ id: string }>(
        "INSERT INTO jugadores (nombre) VALUES ('Beto') RETURNING id",
      );
      const m = await c.query<{ id: string }>(
        "INSERT INTO movimientos (clave, tipo) VALUES ('roto:1', 'ajuste') RETURNING id",
      );
      await c.query("INSERT INTO asientos (movimiento, jugador, monto) VALUES ($1, $2, -10)", [
        m.rows[0]!.id,
        rows[0]!.id,
      ]);
      await c.query("INSERT INTO movimientos (clave, tipo) VALUES ('roto:2', 'ajuste')");
    });
    const r = await revisarCopia(vacia, migraciones);
    expect(r.problemas).toEqual([
      "1 movimientos no suman cero",
      "1 jugadores con saldo negativo",
      "1 movimientos sin asientos",
    ]);
  });
});
