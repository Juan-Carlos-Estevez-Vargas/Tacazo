/**
 * Lo que el servidor de partidas necesita de la base: el perfil de quien
 * entra a la cola, guardar las clasificatorias (rol `tacazo_partidas`) y cobrar
 * entradas y pagar premios (rol `tacazo_monedas`).
 */
import { ENGINE_VERSION } from "@tacazo/core";
import { comoServidor, type Base } from "./db.js";
import { restricciones } from "./moderacion.js";
import {
  cobrarEntrada,
  comoMonedas,
  devolverEntrada,
  pagarPremio,
  saldo,
  SaldoInsuficiente,
  salaPorId,
} from "./monedas.js";
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
  readonly saldo: number;
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
  /**
   * Cobra la entrada a los dos en una sola transacción: o pagan ambos o ninguno.
   * Devuelve null si cobró, o el jugador al que no le alcanzó.
   */
  cobrar(partida: string, nivel: string, a: string, b: string): Promise<string | null>;
  /** Paga al ganador o, si no hubo, devuelve las entradas. Repetirlo no paga dos veces. */
  liquidar(partida: string, nivel: string, a: string, b: string, ganador: string | null): Promise<void>;
  guardar(p: Clasificatoria): Promise<void>;
}

const nivelDe = (id: string) => {
  const s = salaPorId(id);
  if (!s) throw new Error(`Sala desconocida: ${id}`);
  return s;
};

export const esModo = (x: unknown): x is Modo =>
  typeof x === "string" && (MODOS as readonly string[]).includes(x);

export function datosPg(base: Base): Datos {
  return {
    async perfil(jugador, modo) {
      const p = await comoServidor(base, async (c) => {
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
      });
      if (!p) return null;
      return { ...p, saldo: await comoMonedas(base, (c) => saldo(c, jugador)) };
    },
    async cobrar(partida, nivel, a, b) {
      const sala = nivelDe(nivel);
      try {
        return await comoMonedas(base, async (c) => {
          for (const j of [a, b]) if ((await saldo(c, j)) < sala.entrada) return j;
          await cobrarEntrada(c, partida, a, sala);
          await cobrarEntrada(c, partida, b, sala);
          return null;
        });
      } catch (e) {
        if (!(e instanceof SaldoInsuficiente)) throw e;
        // Gastó en otra cosa justo a la vez: se mira de nuevo quién quedó corto.
        const cortos = await comoMonedas(base, async (c) => {
          const out: string[] = [];
          for (const j of [a, b]) if ((await saldo(c, j)) < sala.entrada) out.push(j);
          return out;
        });
        return cortos[0] ?? a;
      }
    },
    liquidar: (partida, nivel, a, b, ganador) =>
      comoMonedas(base, async (c) => {
        const sala = nivelDe(nivel);
        if (ganador) await pagarPremio(c, partida, ganador, sala);
        else for (const j of [a, b]) await devolverEntrada(c, partida, j, sala);
      }),
    guardar: (p) =>
      comoServidor(base, async (c) => {
        await registrarPartida(c, { ...p, clasificatoria: true, motor: ENGINE_VERSION });
      }),
  };
}
