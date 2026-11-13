/**
 * Revisión de una copia restaurada. Restaurar una copia que nadie probó es
 * apostar: esto mira que la copia tenga todas las migraciones, que los
 * libros de monedas cuadren y, si se le da la base de origen, cuántas filas
 * tiene cada tabla en una y otra.
 *
 *   DATABASE_URL=<copia> [ORIGEN_URL=<producción>] pnpm --filter @tacazo/api comprobar-copia
 */
import type { Consulta } from "./db.js";
import type { Migracion } from "./migrar.js";

/** Tablas que se cuentan. Si se agrega una tabla con datos de jugadores, va aquí. */
export const TABLAS = [
  "jugadores",
  "ratings",
  "partidas",
  "amistades",
  "revisiones",
  "reportes",
  "sanciones",
  "movimientos",
  "asientos",
  "inventario",
] as const;

export interface InformeCopia {
  readonly ok: boolean;
  readonly problemas: readonly string[];
  readonly filas: Readonly<Record<string, number>>;
  /** Filas en el origen, si se dio. */
  readonly origen?: Readonly<Record<string, number>>;
}

/** Filas por tabla; una tabla que no existe cuenta -1. */
async function contar(c: Consulta): Promise<Record<string, number>> {
  const filas: Record<string, number> = {};
  for (const t of TABLAS) {
    const { rows: existe } = await c.query<{ r: string | null }>("SELECT to_regclass($1)::text AS r", [t]);
    if (!existe[0]?.r) {
      filas[t] = -1;
      continue;
    }
    const { rows } = await c.query<{ n: string | number }>(`SELECT count(*) AS n FROM ${t}`);
    filas[t] = Number(rows[0]?.n ?? 0);
  }
  return filas;
}

export async function revisarCopia(
  copia: Consulta,
  migraciones: readonly Migracion[],
  origen?: Consulta,
): Promise<InformeCopia> {
  const problemas: string[] = [];

  const { rows: aplicadas } = await copia.query<{ version: string; huella: string }>(
    "SELECT version, huella FROM migraciones",
  );
  const huellas = new Map(aplicadas.map((m) => [m.version, m.huella]));
  for (const m of migraciones) {
    const h = huellas.get(m.version);
    if (h === undefined) problemas.push(`Falta la migración ${m.version}`);
    else if (h !== m.huella) problemas.push(`La migración ${m.version} no coincide con el repo`);
  }

  const filas = await contar(copia);
  const faltan = TABLAS.filter((t) => filas[t] === -1);
  if (faltan.length) {
    problemas.push(`Faltan tablas: ${faltan.join(", ")}`);
    return { ok: false, problemas, filas };
  }
  if (filas.jugadores === 0) problemas.push("La copia no tiene jugadores");

  // Cada movimiento suma cero y nadie queda con saldo negativo.
  const { rows: descuadres } = await copia.query<{ n: string | number }>(
    `SELECT count(*) AS n FROM (
       SELECT movimiento FROM asientos GROUP BY movimiento HAVING sum(monto) <> 0
     ) x`,
  );
  const desc = Number(descuadres[0]?.n ?? 0);
  if (desc) problemas.push(`${desc} movimientos no suman cero`);
  const { rows: negativos } = await copia.query<{ n: string | number }>(
    `SELECT count(*) AS n FROM (
       SELECT jugador FROM asientos WHERE jugador IS NOT NULL GROUP BY jugador HAVING sum(monto) < 0
     ) x`,
  );
  const neg = Number(negativos[0]?.n ?? 0);
  if (neg) problemas.push(`${neg} jugadores con saldo negativo`);
  const { rows: huerfanos } = await copia.query<{ n: string | number }>(
    `SELECT count(*) AS n FROM movimientos m WHERE NOT EXISTS (SELECT 1 FROM asientos a WHERE a.movimiento = m.id)`,
  );
  const hu = Number(huerfanos[0]?.n ?? 0);
  if (hu) problemas.push(`${hu} movimientos sin asientos`);

  if (!origen) return { ok: problemas.length === 0, problemas, filas };

  // La copia es de un momento anterior: puede tener menos filas, nunca más.
  const filasOrigen = await contar(origen);
  for (const t of TABLAS)
    if ((filas[t] ?? 0) > (filasOrigen[t] ?? 0))
      problemas.push(`${t} tiene más filas en la copia (${filas[t]}) que en el origen (${filasOrigen[t]})`);
  return { ok: problemas.length === 0, problemas, filas, origen: filasOrigen };
}
