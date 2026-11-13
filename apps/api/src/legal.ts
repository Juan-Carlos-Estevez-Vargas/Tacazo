/**
 * Lo que pide la Ley 1581 de 2012 (habeas data):
 *
 * - Autorización con prueba: cada aceptación de los términos y de la política
 *   de privacidad se guarda con su versión, la fecha y el rango de edad.
 * - Consulta: el jugador puede bajar todos sus datos en JSON.
 * - Supresión: el jugador puede borrar su cuenta. Se quitan los datos
 *   personales; queda el id como seudónimo donde la integridad del juego lo
 *   necesita (libro de monedas, partidas del rival, reportes y sanciones).
 */
import { LEGAL, type Edad } from "@tacazo/core";
import { comoJugador, comoRol, type Base, type Consulta } from "./db.js";

export interface Aceptacion {
  readonly terminos: string;
  readonly privacidad: string;
  readonly edad: Edad;
  /** Entre 14 y 17 años: dice tener la autorización de su madre, padre o acudiente. */
  readonly autorizacion: boolean;
}

/** Error de la aceptación; la API lo devuelve como 400. */
export class AceptacionInvalida extends Error {}

/** Revisa que acepte las versiones vigentes y, si es menor, con autorización. */
export function validarAceptacion(a: Aceptacion): void {
  if (a.terminos !== LEGAL.terminos || a.privacidad !== LEGAL.privacidad)
    throw new AceptacionInvalida("Los términos o la política cambiaron; recarga la página");
  if (a.edad === "14-17" && !a.autorizacion)
    throw new AceptacionInvalida("Entre 14 y 17 años necesitas la autorización de tu acudiente");
}

/** Guarda las dos aceptaciones. Corre con un rol que puede escribir `consentimientos`. */
export async function registrarAceptacion(c: Consulta, jugador: string, a: Aceptacion): Promise<void> {
  validarAceptacion(a);
  for (const [documento, version] of [
    ["terminos", a.terminos],
    ["privacidad", a.privacidad],
  ] as const)
    await c.query(
      `INSERT INTO consentimientos (jugador, documento, version, edad, autorizacion_acudiente)
       VALUES ($1, $2, $3, $4, $5)`,
      [jugador, documento, version, a.edad, a.edad === "14-17" && a.autorizacion],
    );
}

export interface EstadoLegal {
  readonly terminos: string | null;
  readonly privacidad: string | null;
  /** true si falta aceptar alguna versión vigente. */
  readonly pendiente: boolean;
}

/** Última versión aceptada de cada documento. */
export async function estadoLegal(c: Consulta, jugador: string): Promise<EstadoLegal> {
  const { rows } = await c.query<{ documento: "terminos" | "privacidad"; version: string }>(
    `SELECT DISTINCT ON (documento) documento, version FROM consentimientos
     WHERE jugador = $1 ORDER BY documento, aceptado DESC, id DESC`,
    [jugador],
  );
  const v = (d: string) => rows.find((r) => r.documento === d)?.version ?? null;
  const terminos = v("terminos");
  const privacidad = v("privacidad");
  return { terminos, privacidad, pendiente: terminos !== LEGAL.terminos || privacidad !== LEGAL.privacidad };
}

/** Todos los datos del jugador, para el derecho de consulta. Corre con su sesión (RLS). */
export function exportarDatos(base: Base, jugador: string, ahora: number) {
  return comoJugador(base, jugador, async (c) => {
    const una = async (sql: string) => (await c.query(sql, [jugador])).rows;
    const [perfil] = await una(
      "SELECT id, nombre, pais, region, invitado, creado, equipado FROM jugadores WHERE id = $1",
    );
    return {
      exportado: new Date(ahora).toISOString(),
      perfil,
      consentimientos: await una(
        `SELECT documento, version, edad, autorizacion_acudiente, aceptado
         FROM consentimientos WHERE jugador = $1 ORDER BY aceptado`,
      ),
      ratings: await una("SELECT modo, visible, partidas, actualizado FROM ratings WHERE jugador = $1"),
      partidas: await una(
        `SELECT id, modo, jugador_a, jugador_b, ganador, motivo, clasificatoria, terminada
         FROM partidas WHERE jugador_a = $1 OR jugador_b = $1 ORDER BY terminada`,
      ),
      amistades: await una("SELECT * FROM amistades WHERE a = $1 OR b = $1"),
      monedas: await una(
        `SELECT m.tipo, a.monto, m.creado FROM asientos a JOIN movimientos m ON m.id = a.movimiento
         WHERE a.jugador = $1 ORDER BY m.creado`,
      ),
      inventario: await una("SELECT objeto, obtenido FROM inventario WHERE jugador = $1"),
      reportesHechos: await una("SELECT motivo, detalle, creado FROM reportes WHERE autor = $1"),
      sanciones: await una("SELECT * FROM sanciones WHERE jugador = $1"),
    };
  });
}

/**
 * Borra la cuenta: nombre y país fuera, cuenta desligada, sin rating, amigos
 * ni cosméticos. No se puede deshacer. Las sesiones de invitado dejan de
 * valer porque `jugadorVivo` lo revisa.
 */
export function borrarJugador(base: Base, jugador: string): Promise<boolean> {
  return comoRol(base, "tacazo_cuentas", null, async (c) => {
    const { rows } = await c.query(
      `UPDATE jugadores SET nombre = 'Borrado', pais = NULL, cuenta = NULL, borrado = now()
       WHERE id = $1 AND borrado IS NULL RETURNING id`,
      [jugador],
    );
    if (!rows.length) return false;
    await c.query("DELETE FROM ratings WHERE jugador = $1", [jugador]);
    await c.query("DELETE FROM amistades WHERE a = $1 OR b = $1", [jugador]);
    await c.query("DELETE FROM inventario WHERE jugador = $1", [jugador]);
    return true;
  });
}

/** El jugador existe y no borró su cuenta. */
export const jugadorVivo = (base: Base, jugador: string) =>
  comoRol(base, "tacazo_cuentas", null, async (c) => {
    const { rows } = await c.query("SELECT 1 FROM jugadores WHERE id = $1 AND borrado IS NULL", [jugador]);
    return rows.length > 0;
  });
