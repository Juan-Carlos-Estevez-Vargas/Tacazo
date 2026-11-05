import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Base } from "./db.js";

export const CARPETA = fileURLToPath(new URL("../migraciones/", import.meta.url));
const NOMBRE = /^(\d{8}_\d{2})_[a-z0-9_]+\.sql$/;

export interface Migracion {
  readonly version: string;
  readonly archivo: string;
  readonly sql: string;
  readonly huella: string;
}

/** Lee las migraciones en orden. El nombre es `AAAAMMDD_NN_descripcion.sql`. */
export async function leerMigraciones(carpeta = CARPETA): Promise<Migracion[]> {
  const archivos = (await readdir(carpeta)).filter((f) => f.endsWith(".sql")).sort();
  const out: Migracion[] = [];
  for (const archivo of archivos) {
    const m = NOMBRE.exec(archivo);
    if (!m) throw new Error(`Nombre de migración inválido: ${archivo}`);
    const sql = await readFile(`${carpeta}${archivo}`, "utf8");
    out.push({ version: m[1]!, archivo, sql, huella: createHash("sha256").update(sql).digest("hex") });
  }
  return out;
}

/**
 * Aplica las migraciones pendientes, cada una en su transacción. Si una ya
 * aplicada cambió de contenido, se detiene: las migraciones no se editan, se
 * agrega una nueva.
 */
export async function migrar(base: Base, migraciones: readonly Migracion[]): Promise<string[]> {
  await base.query(`CREATE TABLE IF NOT EXISTS migraciones (
    version text PRIMARY KEY,
    archivo text NOT NULL,
    huella text NOT NULL,
    aplicada timestamptz NOT NULL DEFAULT now()
  )`);
  const hechas = new Map(
    (
      await base.query<{ version: string; huella: string }>("SELECT version, huella FROM migraciones")
    ).rows.map((r) => [r.version, r.huella]),
  );
  const ultima = [...hechas.keys()].sort().at(-1) ?? "";
  const aplicadas: string[] = [];
  for (const m of migraciones) {
    const previa = hechas.get(m.version);
    if (previa !== undefined) {
      if (previa !== m.huella) throw new Error(`La migración ${m.archivo} cambió después de aplicarse`);
      continue;
    }
    if (m.version < ultima)
      throw new Error(`La migración ${m.archivo} es anterior a la última aplicada (${ultima})`);
    await base.transaccion(async (c) => {
      await c.query(m.sql);
      await c.query("INSERT INTO migraciones (version, archivo, huella) VALUES ($1, $2, $3)", [
        m.version,
        m.archivo,
        m.huella,
      ]);
    });
    aplicadas.push(m.archivo);
  }
  return aplicadas;
}
