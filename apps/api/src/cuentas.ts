/**
 * Invitados y cuentas.
 *
 * Todo el mundo empieza como invitado: la API crea su fila en `jugadores` y le
 * da un token firmado que el cliente guarda. Si después inicia sesión con
 * Neon Auth (Google o correo), `vincular` le pone la cuenta a esa misma fila,
 * así no pierde rating, partidas ni amigos.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { comoRol, type Base } from "./db.js";

const PREFIJO = "inv";
/** Un invitado dura un año sin entrar; cada visita renueva el token. */
export const VIDA_INVITADO_MS = 365 * 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Token de invitado: `inv.<jugador>.<vence>.<firma>`. */
export function firmarInvitado(jugador: string, vence: number, secreto: string): string {
  const cuerpo = `${PREFIJO}.${jugador}.${vence}`;
  return `${cuerpo}.${createHmac("sha256", secreto).update(cuerpo).digest("base64url")}`;
}

export function leerInvitado(token: string, secreto: string, ahora: number): string | null {
  const partes = token.split(".");
  if (partes.length !== 4 || partes[0] !== PREFIJO) return null;
  const [, jugador, vence, firma] = partes as [string, string, string, string];
  const esperada = createHmac("sha256", secreto).update(`${PREFIJO}.${jugador}.${vence}`).digest();
  const dada = Buffer.from(firma, "base64url");
  if (dada.length !== esperada.length || !timingSafeEqual(dada, esperada)) return null;
  if (!UUID.test(jugador) || !/^\d+$/.test(vence) || Number(vence) < ahora) return null;
  return jugador;
}

/** Lo que la API necesita saber de una cuenta de Neon Auth. */
export interface Cuenta {
  readonly sub: string;
  readonly nombre: string | null;
  readonly verificada: boolean;
  readonly bloqueada: boolean;
}

export type VerificarCuenta = (jwt: string) => Promise<Cuenta | null>;

/**
 * Verifica un JWT de Neon Auth (EdDSA, 15 min) con el JWKS público.
 * `base` es la URL de Neon Auth, por ejemplo https://ep-x.aws.neon.tech/neondb/auth.
 */
export function verificadorNeon(base: string, claves?: JWTVerifyGetKey): VerificarCuenta {
  const origen = new URL(base).origin;
  const jwks = claves ?? createRemoteJWKSet(new URL(`${base.replace(/\/$/, "")}/.well-known/jwks.json`));
  return async (jwt) => {
    try {
      const { payload } = await jwtVerify(jwt, jwks, {
        issuer: origen,
        audience: origen,
        algorithms: ["EdDSA"],
      });
      if (typeof payload.sub !== "string" || !payload.sub) return null;
      return {
        sub: payload.sub,
        nombre: typeof payload.name === "string" ? payload.name : null,
        verificada: payload.emailVerified === true,
        bloqueada: payload.banned === true,
      };
    } catch {
      return null;
    }
  };
}

export const REGIONES = ["sa", "na", "eu", "as", "oc", "af"] as const;

/** Nombre visible: sin caracteres de control, espacios colapsados, 1 a 20. */
export function limpiarNombre(n: string): string {
  let out = "";
  for (const ch of n.normalize("NFC")) {
    const c = ch.codePointAt(0)!;
    if (c < 32 || (c >= 127 && c < 160) || (c >= 0x200b && c <= 0x200f) || c === 0x2028 || c === 0x2029)
      continue;
    out += ch;
  }
  return [...out.replace(/\s+/g, " ").trim()].slice(0, 20).join("") || "Invitado";
}

const comoCuentas = <T>(base: Base, fn: Parameters<typeof comoRol<T>>[3]) =>
  comoRol(base, "tacazo_cuentas", null, fn);

export async function crearInvitado(
  base: Base,
  datos: { nombre: string; pais: string | null; region: (typeof REGIONES)[number] },
): Promise<string> {
  return comoCuentas(base, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      "INSERT INTO jugadores (nombre, pais, region) VALUES ($1, $2, $3) RETURNING id",
      [limpiarNombre(datos.nombre), datos.pais, datos.region],
    );
    return rows[0]!.id;
  });
}

/** Jugador ligado a una cuenta, si existe. */
export const jugadorDeCuenta = (base: Base, sub: string) =>
  comoCuentas(base, async (c) => {
    const { rows } = await c.query<{ id: string }>("SELECT id FROM jugadores WHERE cuenta = $1", [sub]);
    return rows[0]?.id ?? null;
  });

/**
 * Liga la cuenta al invitado. Si la cuenta ya tenía jugador (inició sesión en
 * otro aparato), se queda con ese y el invitado de este aparato no se toca.
 */
export async function vincular(
  base: Base,
  invitado: string,
  cuenta: Cuenta,
): Promise<{ jugador: string; nuevo: boolean }> {
  if (cuenta.bloqueada) throw new Error("Esta cuenta está bloqueada");
  return comoCuentas(base, async (c) => {
    const ya = await c.query<{ id: string }>("SELECT id FROM jugadores WHERE cuenta = $1 FOR UPDATE", [
      cuenta.sub,
    ]);
    if (ya.rows[0]) return { jugador: ya.rows[0].id, nuevo: false };
    const { rows } = await c.query<{ id: string }>(
      `UPDATE jugadores SET cuenta = $2, invitado = false, vinculado = now()
       WHERE id = $1 AND cuenta IS NULL RETURNING id`,
      [invitado, cuenta.sub],
    );
    if (!rows[0]) throw new Error("Este invitado ya tiene otra cuenta");
    return { jugador: rows[0].id, nuevo: true };
  });
}

/** Cloudflare Turnstile: comprueba que quien crea un invitado es una persona. */
export type VerificarHumano = (token: string, ip: string) => Promise<boolean>;

export function turnstile(secreto: string, f: typeof fetch = fetch): VerificarHumano {
  return async (token, ip) => {
    if (!token || token.length > 2048) return false;
    try {
      const r = await f("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret: secreto, response: token, remoteip: ip }),
        signal: AbortSignal.timeout(5000),
      });
      const d = (await r.json()) as { success?: boolean };
      return d.success === true;
    } catch {
      return false;
    }
  };
}
