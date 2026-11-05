import type { Bola8State, ShotVerdict } from "./reglas/bola8.js";
import type { Shot } from "./physics.js";

/**
 * Protocolo entre cliente y servidor de partidas. Lo comparten los dos para
 * que los tipos no se desfasen. Todo mensaje que llega al servidor pasa por
 * `leerMensajeCliente`: si no cumple tipos y rangos, se rechaza.
 */

/** Versión del protocolo; el saludo la compara. */
export const PROTOCOLO = 1;
/** Tamaño máximo de un mensaje del cliente, en bytes. */
export const MAX_MENSAJE = 4096;

export interface BolaSnapshot {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly onTable: boolean;
}

export interface Snapshot {
  readonly sala: string;
  readonly fase: "esperando" | "jugando" | "terminada";
  readonly reglas: Bola8State;
  readonly bolas: readonly BolaSnapshot[];
  /** Paso de la física, para que la huella del cliente coincida. */
  readonly paso: number;
  readonly jugadores: readonly { readonly nombre: string; readonly conectado: boolean }[];
  /** Último número de secuencia aceptado de cada jugador (para seguir tras reconectar). */
  readonly secuencias: readonly [number, number];
  /** Milisegundos que le quedan al turno; null si el reloj no corre. */
  readonly turnoRestante: number | null;
}

export type MensajeCliente =
  | { readonly t: "saludo"; readonly token: string; readonly cliente: number; readonly motor: number }
  | { readonly t: "apuntar"; readonly angulo: number }
  | {
      readonly t: "tirar";
      readonly seq: number;
      readonly tiro: Shot;
      readonly cantar?: number;
      readonly blanca?: { readonly x: number; readonly y: number };
    };

export type MensajeServidor =
  | { readonly t: "bienvenida"; readonly jugador: 0 | 1; readonly estado: Snapshot }
  | { readonly t: "estado"; readonly estado: Snapshot }
  | { readonly t: "apunta"; readonly angulo: number }
  | {
      readonly t: "resultado";
      readonly jugador: 0 | 1;
      readonly seq: number;
      readonly tiro: Shot;
      readonly cantar: number | null;
      readonly blanca: { readonly x: number; readonly y: number } | null;
      readonly veredicto: Pick<ShotVerdict, "fouls" | "keepsTurn" | "respot" | "pocketed">;
      readonly hash: string;
      readonly estado: Snapshot;
    }
  | { readonly t: "tiempo"; readonly jugador: 0 | 1; readonly estado: Snapshot }
  | { readonly t: "rechazo"; readonly motivo: string }
  | {
      readonly t: "error";
      readonly codigo: "version" | "token" | "sala" | "abuso";
      readonly mensaje: string;
    };

export type Lectura =
  { readonly ok: true; readonly msg: MensajeCliente } | { readonly ok: false; readonly motivo: string };

const esObjeto = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const num = (x: unknown, min: number, max: number): x is number =>
  typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;
const entero = (x: unknown, min: number, max: number): x is number => num(x, min, max) && Number.isInteger(x);
const soloClaves = (o: Record<string, unknown>, claves: readonly string[]) =>
  Object.keys(o).every((k) => claves.includes(k));

const LIMITE_ANGULO = 1000;

/**
 * Lee y valida un mensaje del cliente. No confía en nada: tipos, rangos,
 * claves de más y tamaño.
 */
export function leerMensajeCliente(texto: string): Lectura {
  const no = (motivo: string): Lectura => ({ ok: false, motivo });
  if (texto.length > MAX_MENSAJE) return no("Mensaje demasiado grande");
  let x: unknown;
  try {
    x = JSON.parse(texto);
  } catch {
    return no("JSON inválido");
  }
  if (!esObjeto(x)) return no("Se esperaba un objeto");
  switch (x.t) {
    case "saludo":
      if (!soloClaves(x, ["t", "token", "cliente", "motor"])) return no("Claves de más");
      if (typeof x.token !== "string" || x.token.length > 1024) return no("Token inválido");
      if (!entero(x.cliente, 0, 1e6) || !entero(x.motor, 0, 1e6)) return no("Versión inválida");
      return { ok: true, msg: { t: "saludo", token: x.token, cliente: x.cliente, motor: x.motor } };
    case "apuntar":
      if (!soloClaves(x, ["t", "angulo"])) return no("Claves de más");
      if (!num(x.angulo, -LIMITE_ANGULO, LIMITE_ANGULO)) return no("Ángulo inválido");
      return { ok: true, msg: { t: "apuntar", angulo: x.angulo } };
    case "tirar": {
      if (!soloClaves(x, ["t", "seq", "tiro", "cantar", "blanca"])) return no("Claves de más");
      if (!entero(x.seq, 1, 1e6)) return no("Secuencia inválida");
      const s = x.tiro;
      if (!esObjeto(s) || !soloClaves(s, ["angle", "power", "side", "top", "elevation"]))
        return no("Tiro inválido");
      if (
        !num(s.angle, -LIMITE_ANGULO, LIMITE_ANGULO) ||
        !num(s.power, 0.02, 1) ||
        !num(s.side, -1, 1) ||
        !num(s.top, -1, 1) ||
        !num(s.elevation, 0, 70) ||
        s.side * s.side + s.top * s.top > 1
      )
        return no("Tiro fuera de rango");
      const tiro: Shot = { angle: s.angle, power: s.power, side: s.side, top: s.top, elevation: s.elevation };
      let cantar: number | undefined;
      if (x.cantar !== undefined) {
        if (!entero(x.cantar, 0, 31)) return no("Tronera inválida");
        cantar = x.cantar;
      }
      let blanca: { x: number; y: number } | undefined;
      if (x.blanca !== undefined) {
        const b = x.blanca;
        if (!esObjeto(b) || !soloClaves(b, ["x", "y"]) || !num(b.x, -10, 10) || !num(b.y, -10, 10))
          return no("Posición de la blanca inválida");
        blanca = { x: b.x, y: b.y };
      }
      return {
        ok: true,
        msg: {
          t: "tirar",
          seq: x.seq,
          tiro,
          ...(cantar === undefined ? {} : { cantar }),
          ...(blanca === undefined ? {} : { blanca }),
        },
      };
    }
    default:
      return no("Tipo de mensaje desconocido");
  }
}
