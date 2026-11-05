import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Token de partida: dice a qué sala y en qué silla se sienta quien lo trae.
 * Va firmado con HMAC-SHA256 para que nadie pueda fabricar uno ni cambiar de
 * silla. Formato: base64url(JSON) "." base64url(firma).
 */
export interface DatosToken {
  readonly sala: string;
  readonly jugador: 0 | 1;
  readonly nombre: string;
  /** Vence (ms desde 1970). */
  readonly vence: number;
}

const b64 = (b: Buffer) => b.toString("base64url");

export function firmarToken(datos: DatosToken, secreto: string): string {
  const cuerpo = b64(Buffer.from(JSON.stringify(datos)));
  const firma = b64(createHmac("sha256", secreto).update(cuerpo).digest());
  return `${cuerpo}.${firma}`;
}

export function leerToken(token: string, secreto: string, ahora: number): DatosToken | null {
  const [cuerpo, firma, ...resto] = token.split(".");
  if (!cuerpo || !firma || resto.length) return null;
  const esperada = createHmac("sha256", secreto).update(cuerpo).digest();
  const dada = Buffer.from(firma, "base64url");
  if (dada.length !== esperada.length || !timingSafeEqual(dada, esperada)) return null;
  let d: unknown;
  try {
    d = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof d !== "object" || d === null) return null;
  const o = d as Record<string, unknown>;
  if (typeof o.sala !== "string" || (o.jugador !== 0 && o.jugador !== 1)) return null;
  if (typeof o.nombre !== "string" || typeof o.vence !== "number" || o.vence < ahora) return null;
  return { sala: o.sala, jugador: o.jugador, nombre: o.nombre, vence: o.vence };
}
