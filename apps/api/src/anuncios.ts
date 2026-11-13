/**
 * Anuncio con premio. Las monedas se acreditan solo cuando la red de anuncios
 * (AdMob) le confirma al servidor, con su firma, que el anuncio se vio
 * completo: verificación del lado del servidor (SSV). El cliente nunca dice
 * "ya lo vi".
 *
 * AdMob llama a `GET /anuncios/admob?...&signature=...&key_id=...`. Se firma
 * con ECDSA P-256 + SHA-256 el texto de la consulta hasta antes de
 * `&signature=`. Las claves públicas están en VERIFICADOR_ADMOB.
 */
import { createPublicKey, verify, type KeyObject } from "node:crypto";
import type { Consulta } from "./db.js";
import { hastaManana, mover, pagar, saldo, SALAS } from "./monedas.js";

export const VERIFICADOR_ADMOB = "https://www.gstatic.com/admob/reward/verifier-keys.json";
export const PREMIO_ANUNCIO = 50;
export const ANUNCIOS_POR_DIA = 3;

/** Entrada de la sala más barata: el anuncio solo se ofrece por debajo de ella. */
export const ENTRADA_MINIMA = Math.min(...SALAS.map((s) => s.entrada));

export type ClavesAnuncio = (id: string) => Promise<KeyObject | null>;

/**
 * Lee las claves públicas de AdMob y las guarda 24 h. Si llega un `key_id`
 * desconocido vuelve a pedirlas (AdMob las rota), como mucho una vez por minuto.
 */
export function clavesAdmob(f: typeof fetch = fetch, ahora: () => number = Date.now): ClavesAnuncio {
  let cache = new Map<string, KeyObject>();
  let leidas = 0;
  const cargar = async () => {
    const r = await f(VERIFICADOR_ADMOB, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`AdMob respondió ${r.status}`);
    const { keys } = (await r.json()) as { keys: { keyId: number | string; pem: string }[] };
    cache = new Map(keys.map((k) => [String(k.keyId), createPublicKey(k.pem)]));
    leidas = ahora();
  };
  return async (id) => {
    const t = ahora();
    if (t - leidas > 86_400_000 || (!cache.has(id) && t - leidas > 60_000)) {
      try {
        await cargar();
      } catch {
        // Sin claves no se acredita nada; AdMob reintentará.
      }
    }
    return cache.get(id) ?? null;
  };
}

export interface PremioAdmob {
  readonly transaccion: string;
  readonly jugador: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Comprueba la firma de AdMob sobre la consulta cruda (sin el `?`). Devuelve la
 * transacción y el jugador (`user_id`), o null si algo no cuadra.
 */
export async function verificarAdmob(consulta: string, claves: ClavesAnuncio): Promise<PremioAdmob | null> {
  const i = consulta.indexOf("&signature=");
  if (i <= 0) return null;
  const firmado = consulta.slice(0, i);
  const p = new URLSearchParams(consulta);
  const firma = p.get("signature");
  const id = p.get("key_id");
  const transaccion = p.get("transaction_id");
  const jugador = p.get("user_id");
  if (!firma || !id || !transaccion || !jugador || !UUID.test(jugador)) return null;
  if (!/^[\w-]{1,128}$/.test(transaccion)) return null;
  const clave = await claves(id);
  if (!clave) return null;
  let ok: boolean;
  try {
    ok = verify("sha256", Buffer.from(firmado, "utf8"), clave, Buffer.from(firma, "base64url"));
  } catch {
    ok = false;
  }
  return ok ? { transaccion, jugador } : null;
}

/** Anuncios con premio cobrados desde la última medianoche de Colombia. */
export async function anunciosDeHoy(c: Consulta, jugador: string, ahora: number): Promise<number> {
  const inicio = ahora + hastaManana(ahora) - 86_400_000;
  const { rows } = await c.query<{ n: string | number }>(
    `SELECT count(*) AS n FROM movimientos m JOIN asientos a ON a.movimiento = m.id
     WHERE m.tipo = 'anuncio' AND a.jugador = $1 AND m.creado >= to_timestamp($2::double precision / 1000)`,
    [jugador, inicio],
  );
  return Number(rows[0]?.n ?? 0);
}

export type ResultadoAnuncio = "acreditado" | "repetido" | "limite" | "con_saldo" | "sin_jugador";

/**
 * Acredita el premio de un anuncio ya verificado. Solo si el jugador no
 * alcanza para la sala más barata y no pasó el límite del día. Corre con
 * `tacazo_monedas`; la misma transacción de AdMob nunca paga dos veces.
 */
export async function acreditarAnuncio(
  c: Consulta,
  p: PremioAdmob,
  ahora: number,
): Promise<ResultadoAnuncio> {
  const clave = `anuncio:${p.transaccion}`;
  const ya = await c.query("SELECT 1 FROM movimientos WHERE clave = $1", [clave]);
  if (ya.rows.length) return "repetido";
  // Bloquea al jugador para que dos anuncios a la vez no pasen el límite.
  const j = await c.query("SELECT id FROM jugadores WHERE id = $1 FOR UPDATE", [p.jugador]);
  if (!j.rows.length) return "sin_jugador";
  if ((await saldo(c, p.jugador)) >= ENTRADA_MINIMA) return "con_saldo";
  if ((await anunciosDeHoy(c, p.jugador, ahora)) >= ANUNCIOS_POR_DIA) return "limite";
  const nuevo = await mover(c, {
    clave,
    tipo: "anuncio",
    asientos: pagar(p.jugador, PREMIO_ANUNCIO, "emision"),
  });
  return nuevo ? "acreditado" : "repetido";
}
