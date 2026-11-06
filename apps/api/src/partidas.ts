/**
 * Lo que el servidor de partidas necesita de la base: el perfil de quien
 * entra a la cola y guardar las clasificatorias. Corre con el rol
 * `tacazo_partidas`.
 */
import { ENGINE_VERSION } from "@tacazo/core";
import { comoServidor, type Base } from "./db.js";
import { restricciones } from "./moderacion.js";
import { REPETIDOS_RECIENTES } from "./constantes.js";
import { MODOS, registrarPartida, type Modo } from "./ranking.js";

export interface PerfilCola {
  readonly nombre: string;
  readonly region: string;
  readonly rating: number;
  /** Últimos rivales, el más reciente al final. */
  readonly recientes: readonly string[];
  readonly juega: boolean;
  readonly clasifica: boolean;
}

export interface Clasificatoria {
  readonly modo: Modo;
  readonly sala: string;
  readonly a: string;
  readonly b: string;
  readonly ganador: string | null;
  readonly motivo: string | null;
  readonly repeticion: unknown;
}

export interface Datos {
  perfil(jugador: string, modo: Modo): Promise<PerfilCola | null>;
  guardar(p: Clasificatoria): Promise<void>;
}

export const esModo = (x: unknown): x is Modo =>
  typeof x === "string" && (MODOS as readonly string[]).includes(x);

export function datosPg(base: Base): Datos {
  return {
    perfil: (jugador, modo) =>
      comoServidor(base, async (c) => {
        const { rows } = await c.query<{ nombre: string; region: string; r: number | null }>(
          `SELECT j.nombre, j.region, r.r FROM jugadores j
           LEFT JOIN ratings r ON r.jugador = j.id AND r.modo = $2
           WHERE j.id = $1`,
          [jugador, modo],
        );
        const j = rows[0];
        if (!j) return null;
        const { rows: rivales } = await c.query<{ rival: string }>(
          `SELECT CASE WHEN jugador_a = $1 THEN jugador_b ELSE jugador_a END AS rival
           FROM partidas WHERE $1 IN (jugador_a, jugador_b) ORDER BY terminada DESC LIMIT $2`,
          [jugador, REPETIDOS_RECIENTES],
        );
        const r = await restricciones(c, jugador);
        return {
          nombre: j.nombre,
          region: j.region,
          rating: j.r ?? 1500,
          recientes: rivales.map((x) => x.rival).reverse(),
          juega: r.juega,
          clasifica: r.clasifica,
        };
      }),
    guardar: (p) =>
      comoServidor(base, async (c) => {
        await registrarPartida(c, { ...p, clasificatoria: true, motor: ENGINE_VERSION });
      }),
  };
}
