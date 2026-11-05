/**
 * Acceso a PostgreSQL. Todo pasa por `Base`, que sirve igual con `pg` (Neon en
 * producción) y con PGlite (pruebas sin servidor).
 *
 * Las consultas van siempre parametrizadas. Lo que hace un jugador corre en
 * `comoJugador`, que cambia al rol `tacazo_api` y fija `app.jugador` solo para
 * esa transacción: así la seguridad por fila de la base decide qué ve.
 */

export interface Filas<T> {
  readonly rows: T[];
}

/** Lo mínimo que comparten `pg.PoolClient` y PGlite. */
export interface Consulta {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<Filas<T>>;
}

export interface Base extends Consulta {
  /** Corre `fn` en una transacción; si lanza, se deshace todo. */
  transaccion<T>(fn: (c: Consulta) => Promise<T>): Promise<T>;
  cerrar(): Promise<void>;
}

export type Rol = "tacazo_api" | "tacazo_partidas" | "tacazo_moderacion" | "tacazo_cuentas";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Transacción con un rol restringido y, si se da, el jugador que pide. */
export function comoRol<T>(
  base: Base,
  rol: Rol,
  jugador: string | null,
  fn: (c: Consulta) => Promise<T>,
): Promise<T> {
  if (jugador !== null && !UUID.test(jugador)) return Promise.reject(new Error("Jugador inválido"));
  return base.transaccion(async (c) => {
    // El nombre del rol viene de un tipo cerrado, no del usuario.
    await c.query(`SET LOCAL ROLE ${rol}`);
    await c.query("SELECT set_config('app.jugador', $1, true)", [jugador ?? ""]);
    return fn(c);
  });
}

export const comoJugador = <T>(base: Base, jugador: string | null, fn: (c: Consulta) => Promise<T>) =>
  comoRol(base, "tacazo_api", jugador, fn);

export const comoServidor = <T>(base: Base, fn: (c: Consulta) => Promise<T>) =>
  comoRol(base, "tacazo_partidas", null, fn);

/** Base sobre un pool de `pg` (producción). */
export async function basePg(url: string): Promise<Base> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  return {
    query: (sql, params) => pool.query(sql, params) as never,
    async transaccion(fn) {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const r = await fn(c as unknown as Consulta);
        await c.query("COMMIT");
        return r;
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    },
    cerrar: () => pool.end(),
  };
}
