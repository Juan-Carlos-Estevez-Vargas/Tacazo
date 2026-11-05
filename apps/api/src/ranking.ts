import { actualizar, type Rating } from "./glicko2.js";
import type { Consulta } from "./db.js";

export const MODOS = ["bola8", "bola9", "bola10", "carambola", "tresbandas", "snooker"] as const;
export type Modo = (typeof MODOS)[number];

/** Partidas mínimas para aparecer en una tabla de posiciones. */
export const MINIMO_TABLA = 10;
export const TAMANO_TABLA = 100;

export interface PartidaTerminada {
  readonly modo: Modo;
  readonly sala: string;
  readonly a: string;
  readonly b: string;
  /** null si nadie ganó (sala cerrada sin resultado). */
  readonly ganador: string | null;
  readonly motivo: string | null;
  readonly clasificatoria: boolean;
  readonly motor: number;
  readonly repeticion: unknown;
}

export interface Fila {
  readonly puesto: number;
  readonly id: string;
  readonly nombre: string;
  readonly pais: string | null;
  readonly visible: number;
  readonly partidas: number;
}

async function ratingDe(c: Consulta, jugador: string, modo: Modo): Promise<Rating & { partidas: number }> {
  await c.query("INSERT INTO ratings (jugador, modo) VALUES ($1, $2) ON CONFLICT DO NOTHING", [
    jugador,
    modo,
  ]);
  const { rows } = await c.query<{ r: number; rd: number; sigma: number; partidas: number }>(
    "SELECT r, rd, sigma, partidas FROM ratings WHERE jugador = $1 AND modo = $2 FOR UPDATE",
    [jugador, modo],
  );
  return rows[0]!;
}

/**
 * Guarda la partida y, si es clasificatoria y tiene ganador, actualiza el
 * rating de los dos. Cada partida cuenta como un período de Glicko-2 de un
 * solo resultado; así el rating se ve cambiar al terminar. Debe correr dentro
 * de una transacción con el rol `tacazo_partidas`.
 */
export async function registrarPartida(
  c: Consulta,
  p: PartidaTerminada,
): Promise<{ id: string; ratings: Record<string, Rating> | null }> {
  if (p.a === p.b) throw new Error("Una partida necesita dos jugadores distintos");
  if (p.ganador !== null && p.ganador !== p.a && p.ganador !== p.b)
    throw new Error("Ganador ajeno a la partida");
  const { rows } = await c.query<{ id: string }>(
    `INSERT INTO partidas (modo, sala, jugador_a, jugador_b, ganador, motivo, clasificatoria, motor, repeticion)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [p.modo, p.sala, p.a, p.b, p.ganador, p.motivo, p.clasificatoria, p.motor, JSON.stringify(p.repeticion)],
  );
  const id = rows[0]!.id;
  if (!p.clasificatoria || p.ganador === null) return { id, ratings: null };

  // Bloquear siempre en el mismo orden evita interbloqueos entre partidas.
  const [primero, segundo] = p.a < p.b ? [p.a, p.b] : [p.b, p.a];
  const viejos = {
    [primero]: await ratingDe(c, primero, p.modo),
    [segundo]: await ratingDe(c, segundo, p.modo),
  };
  const ra = viejos[p.a]!;
  const rb = viejos[p.b]!;
  const ganaA = p.ganador === p.a;
  const nuevos = {
    [p.a]: actualizar(ra, [{ rival: rb, puntos: ganaA ? 1 : 0 }]),
    [p.b]: actualizar(rb, [{ rival: ra, puntos: ganaA ? 0 : 1 }]),
  };
  for (const [jugador, n] of Object.entries(nuevos)) {
    await c.query(
      `UPDATE ratings SET r = $3, rd = $4, sigma = $5, partidas = partidas + 1, actualizado = now()
       WHERE jugador = $1 AND modo = $2`,
      [jugador, p.modo, n.r, n.rd, n.sigma],
    );
  }
  return { id, ratings: nuevos };
}

const SELECT_TABLA = `
  SELECT j.id, j.nombre, j.pais, r.visible, r.partidas,
         rank() OVER (ORDER BY r.visible DESC)::integer AS puesto
  FROM ratings r JOIN jugadores j ON j.id = r.jugador
  WHERE r.modo = $1 AND r.partidas >= $2`;

const leer = async (c: Consulta, sql: string, params: unknown[]): Promise<Fila[]> =>
  (await c.query<Fila>(`${sql} ORDER BY r.visible DESC, j.id LIMIT ${TAMANO_TABLA}`, params)).rows;

/** Los mejores del mundo en un modo. */
export const tablaGlobal = (c: Consulta, modo: Modo) => leer(c, SELECT_TABLA, [modo, MINIMO_TABLA]);

/** Los mejores de un país (código ISO de dos letras). */
export function tablaPais(c: Consulta, modo: Modo, pais: string): Promise<Fila[]> {
  if (!/^[A-Z]{2}$/.test(pais)) return Promise.reject(new Error("País inválido"));
  return leer(c, `${SELECT_TABLA} AND j.pais = $3`, [modo, MINIMO_TABLA, pais]);
}

/**
 * El jugador y sus amigos, sin mínimo de partidas. Usa `jugador_actual()`, así
 * que corre como `tacazo_api` dentro de `comoJugador`.
 */
export const tablaAmigos = (c: Consulta, modo: Modo) =>
  leer(
    c,
    `SELECT j.id, j.nombre, j.pais, r.visible, r.partidas,
            rank() OVER (ORDER BY r.visible DESC)::integer AS puesto
     FROM ratings r JOIN jugadores j ON j.id = r.jugador
     WHERE r.modo = $1 AND r.partidas >= $2 AND (
       j.id = jugador_actual()
       OR j.id IN (SELECT CASE WHEN a = jugador_actual() THEN b ELSE a END FROM amistades)
     )`,
    [modo, 0],
  );
