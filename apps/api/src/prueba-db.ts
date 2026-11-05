// Base en memoria con PGlite para las pruebas. No se publica en el build.
import { PGlite } from "@electric-sql/pglite";
import { basePg, type Base, type Consulta } from "./db.js";

type Motor = Pick<PGlite, "query" | "exec">;

function adaptar(db: Motor): Consulta {
  return {
    async query<T>(sql: string, params?: unknown[]) {
      // Sin parámetros puede traer varias sentencias (migraciones).
      if (!params || params.length === 0) {
        const res = await db.exec(sql);
        return { rows: (res.at(-1)?.rows ?? []) as T[] };
      }
      return { rows: (await db.query<T>(sql, params)).rows };
    },
  };
}

/**
 * Con `TACAZO_PG_PRUEBA` (URL de una base vacía) las pruebas corren contra un
 * PostgreSQL de verdad; si no, contra PGlite en memoria.
 */
export async function baseEnMemoria(): Promise<Base> {
  const url = process.env.TACAZO_PG_PRUEBA;
  if (url) return basePg(url);
  const db = await PGlite.create();
  const c = adaptar(db);
  return {
    query: c.query,
    transaccion: (fn) => db.transaction((tx) => fn(adaptar(tx))),
    cerrar: () => db.close(),
  };
}
