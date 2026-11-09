/**
 * API HTTP de Tacazo (Fastify + Zod): invitados, cuentas, perfil, ranking,
 * reportes y apelaciones. Cada petición de un jugador corre en `comoJugador`,
 * así que la seguridad por fila de la base decide qué ve.
 *
 * Autorización: `Authorization: Bearer <token>`, con un token de invitado
 * (`inv.…`) o un JWT de Neon Auth ya vinculado a un jugador.
 */
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import {
  crearInvitado,
  firmarInvitado,
  jugadorDeCuenta,
  leerInvitado,
  limpiarNombre,
  REGIONES,
  VIDA_INVITADO_MS,
  vincular,
  type VerificarCuenta,
  type VerificarHumano,
} from "./cuentas.js";
import { comoJugador, comoRol, type Base } from "./db.js";
import { apelar, MOTIVOS, reportar, restricciones } from "./moderacion.js";
import {
  CATALOGO,
  cobrarDiario,
  comoMonedas,
  conseguir,
  darBienvenida,
  diarioCobrado,
  hastaManana,
  inventario,
  PREMIO_DIARIO,
  revisarEquipo,
  saldo,
  SaldoInsuficiente,
  SALAS,
  type Equipado,
} from "./monedas.js";
import { MODOS, tablaAmigos, tablaGlobal, tablaPais } from "./ranking.js";

export interface OpcionesApi {
  readonly base: Base;
  readonly secreto: string;
  readonly verificarCuenta: VerificarCuenta;
  /** null desactiva Turnstile (solo en desarrollo). */
  readonly verificarHumano: VerificarHumano | null;
  readonly origenes: readonly string[];
  readonly ahora?: () => number;
  /** Peticiones por minuto por IP. */
  readonly limite?: number;
}

const Uuid = z.uuid();
const Pais = z
  .string()
  .regex(/^[A-Z]{2}$/)
  .nullable();
const Region = z.enum(REGIONES);

const esquemas = {
  invitado: z.strictObject({
    nombre: z.string().max(60),
    pais: Pais.default(null),
    region: Region.default("sa"),
    turnstile: z.string().max(2048).default(""),
  }),
  vincular: z.strictObject({ jwt: z.string().min(10).max(8192) }),
  perfil: z.strictObject({
    nombre: z.string().max(60).optional(),
    pais: Pais.optional(),
    region: Region.optional(),
  }),
  ranking: z.strictObject({
    alcance: z.enum(["global", "pais", "amigos"]).default("global"),
    pais: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
  }),
  reporte: z.strictObject({
    partida: Uuid,
    reportado: Uuid,
    motivo: z.enum(MOTIVOS),
    detalle: z.string().max(500).optional(),
  }),
  apelacion: z.strictObject({ texto: z.string().max(1000) }),
  equipado: z.strictObject({
    taco: z.string().max(40).optional(),
    pano: z.string().max(40).optional(),
    marco: z.string().max(40).optional(),
  }),
  objeto: z.string().regex(/^[a-z0-9_]{2,40}$/),
};

/** Vida del token para el servidor de partidas. */
export const SESION_JUEGO_MS = 2 * 60 * 60 * 1000;

class ErrorApi extends Error {
  constructor(
    readonly estado: number,
    readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

export async function crearApi(o: OpcionesApi): Promise<FastifyInstance> {
  const ahora = o.ahora ?? Date.now;
  const app = Fastify({ bodyLimit: 16 * 1024, logger: false, trustProxy: true });
  await app.register(cors, { origin: [...o.origenes], methods: ["GET", "POST", "PATCH"] });

  // Límite simple por IP y minuto.
  const cuentas = new Map<string, { n: number; desde: number }>();
  const limite = o.limite ?? 120;
  app.addHook("onRequest", async (req) => {
    const t = ahora();
    const k = req.ip;
    const x = cuentas.get(k);
    if (!x || t - x.desde > 60_000) cuentas.set(k, { n: 1, desde: t });
    else if (++x.n > limite) throw new ErrorApi(429, "limite", "Demasiadas peticiones, espera un momento");
    if (cuentas.size > 50_000) cuentas.clear();
  });

  app.setErrorHandler((e: unknown, _req, res) => {
    if (e instanceof ErrorApi) return res.code(e.estado).send({ error: e.codigo, mensaje: e.message });
    if (e instanceof SaldoInsuficiente) return res.code(409).send({ error: "saldo", mensaje: e.message });
    if (e instanceof z.ZodError) return res.code(400).send({ error: "datos", mensaje: "Datos inválidos" });
    const err = e as { statusCode?: number; message?: string };
    if (err.statusCode && err.statusCode < 500)
      return res.code(err.statusCode).send({ error: "peticion", mensaje: "Petición inválida" });
    const msg = err.message ?? "";
    // Errores de reglas del negocio (lanzados a propósito) son 409.
    if (/^(Ya |Esta |Este |Ese |Cuéntanos|Motivo|Se desbloquea)/.test(msg))
      return res.code(409).send({ error: "regla", mensaje: msg });
    if (/row-level security|violates foreign key/.test(msg))
      return res.code(403).send({ error: "permiso", mensaje: "No puedes hacer eso" });
    app.log.error(e);
    return res.code(500).send({ error: "interno", mensaje: "Algo falló de nuestro lado" });
  });

  const bearer = (req: FastifyRequest) => {
    const h = req.headers.authorization;
    return h?.startsWith("Bearer ") ? h.slice(7).trim() : null;
  };

  /** Jugador de la petición, o error 401. */
  async function quien(req: FastifyRequest): Promise<string> {
    const t = bearer(req);
    if (!t) throw new ErrorApi(401, "sesion", "Falta la sesión");
    if (t.startsWith("inv.")) {
      const j = leerInvitado(t, o.secreto, ahora());
      if (!j) throw new ErrorApi(401, "sesion", "Sesión inválida o vencida");
      return j;
    }
    const cuenta = await o.verificarCuenta(t);
    if (!cuenta || cuenta.bloqueada) throw new ErrorApi(401, "sesion", "Sesión inválida o vencida");
    const j = await jugadorDeCuenta(o.base, cuenta.sub);
    if (!j) throw new ErrorApi(401, "sin_vincular", "Esta cuenta todavía no tiene jugador");
    return j;
  }

  const tokenInvitado = (j: string) => firmarInvitado(j, ahora() + VIDA_INVITADO_MS, o.secreto);

  app.get("/salud", async () => ({ ok: true }));

  app.post("/invitados", async (req, res) => {
    const d = esquemas.invitado.parse(req.body);
    if (o.verificarHumano && !(await o.verificarHumano(d.turnstile, req.ip)))
      throw new ErrorApi(403, "humano", "No pudimos comprobar que eres una persona");
    const jugador = await crearInvitado(o.base, d);
    await comoMonedas(o.base, (c) => darBienvenida(c, jugador));
    return res.code(201).send({ jugador, token: tokenInvitado(jugador) });
  });

  app.post("/cuenta/vincular", async (req) => {
    const t = bearer(req);
    const invitado = t ? leerInvitado(t, o.secreto, ahora()) : null;
    if (!invitado) throw new ErrorApi(401, "sesion", "Hace falta la sesión de invitado");
    const { jwt } = esquemas.vincular.parse(req.body);
    const cuenta = await o.verificarCuenta(jwt);
    if (!cuenta) throw new ErrorApi(401, "cuenta", "No pudimos verificar la cuenta");
    return vincular(o.base, invitado, cuenta);
  });

  /**
   * Token corto para el servidor de partidas (cola clasificatoria). Sirve igual
   * para invitados y para cuentas: el servidor solo necesita saber qué jugador es.
   */
  app.post("/sesion-juego", async (req) => {
    const j = await quien(req);
    return { jugador: j, token: firmarInvitado(j, ahora() + SESION_JUEGO_MS, o.secreto) };
  });

  app.get("/yo", async (req) => {
    const j = await quien(req);
    return comoJugador(o.base, j, async (c) => {
      const { rows } = await c.query(
        "SELECT id, nombre, pais, region, invitado, equipado FROM jugadores WHERE id = $1",
        [j],
      );
      const { rows: ratings } = await c.query(
        "SELECT modo, visible, partidas FROM ratings WHERE jugador = $1 ORDER BY modo",
        [j],
      );
      return { ...rows[0], ratings };
    });
  });

  app.patch("/yo", async (req) => {
    const j = await quien(req);
    const d = esquemas.perfil.parse(req.body);
    return comoJugador(o.base, j, async (c) => {
      const { rows } = await c.query(
        `UPDATE jugadores SET
           nombre = coalesce($2, nombre),
           pais = CASE WHEN $3::boolean THEN $4 ELSE pais END,
           region = coalesce($5, region)
         WHERE id = $1 RETURNING id, nombre, pais, region`,
        [
          j,
          d.nombre === undefined ? null : limpiarNombre(d.nombre),
          d.pais !== undefined,
          d.pais ?? null,
          d.region ?? null,
        ],
      );
      return rows[0];
    });
  });

  app.get<{ Params: { modo: string } }>("/ranking/:modo", async (req) => {
    const modo = z.enum(MODOS).parse(req.params.modo);
    const q = esquemas.ranking.parse(req.query);
    if (q.alcance === "amigos") {
      const j = await quien(req);
      return comoJugador(o.base, j, (c) => tablaAmigos(c, modo));
    }
    if (q.alcance === "pais") {
      if (!q.pais) throw new ErrorApi(400, "datos", "Falta el país");
      return comoJugador(o.base, null, (c) => tablaPais(c, modo, q.pais!));
    }
    return comoJugador(o.base, null, (c) => tablaGlobal(c, modo));
  });

  app.post("/reportes", async (req, res) => {
    const j = await quien(req);
    const d = esquemas.reporte.parse(req.body);
    const id = await comoJugador(o.base, j, (c) => reportar(c, j, d));
    return res.code(201).send({ id });
  });

  app.get("/sanciones", async (req) => {
    const j = await quien(req);
    const lista = await comoJugador(
      o.base,
      j,
      async (c) =>
        (
          await c.query(
            "SELECT id, nivel, motivo, desde, hasta, apelacion_estado, levantada FROM sanciones ORDER BY desde DESC",
          )
        ).rows,
    );
    const vigentes = await comoRol(o.base, "tacazo_partidas", null, (c) => restricciones(c, j));
    return { vigentes, lista };
  });

  app.post<{ Params: { id: string } }>("/sanciones/:id/apelacion", async (req, res: FastifyReply) => {
    const j = await quien(req);
    const id = Uuid.parse(req.params.id);
    const { texto } = esquemas.apelacion.parse(req.body);
    await comoJugador(o.base, j, (c) => apelar(c, id, texto));
    return res.code(204).send();
  });

  // ---------- Monedas y cosméticos ----------

  /** Partidas clasificatorias jugadas (todas las modalidades), para desbloqueos. */
  const partidasDe = (j: string) =>
    comoJugador(o.base, j, async (c) => {
      const { rows } = await c.query<{ n: string | number | null }>(
        "SELECT coalesce(sum(partidas), 0) AS n FROM ratings WHERE jugador = $1",
        [j],
      );
      return Number(rows[0]?.n ?? 0);
    });

  app.get("/monedas", async (req) => {
    const j = await quien(req);
    return comoMonedas(o.base, async (c) => {
      // Quien existía antes de las monedas recibe su bienvenida aquí (una sola vez).
      await darBienvenida(c, j);
      const t = ahora();
      const cobrado = await diarioCobrado(c, j, t);
      return {
        saldo: await saldo(c, j),
        salas: SALAS,
        diario: { monto: PREMIO_DIARIO, disponible: !cobrado, enMs: cobrado ? hastaManana(t) : 0 },
      };
    });
  });

  app.post("/monedas/diario", async (req) => {
    const j = await quien(req);
    return comoMonedas(o.base, async (c) => {
      const cobrado = await cobrarDiario(c, j, ahora());
      if (!cobrado) throw new ErrorApi(409, "diario", "Ya cobraste el premio de hoy");
      return { monto: PREMIO_DIARIO, saldo: await saldo(c, j) };
    });
  });

  app.get("/tienda", async (req) => {
    const j = await quien(req);
    const partidas = await partidasDe(j);
    const equipado = await comoJugador(o.base, j, async (c) => {
      const { rows } = await c.query<{ equipado: Equipado }>("SELECT equipado FROM jugadores WHERE id = $1", [
        j,
      ]);
      return rows[0]?.equipado ?? {};
    });
    const { tiene, monedas } = await comoMonedas(o.base, async (c) => ({
      tiene: await inventario(c, j),
      monedas: await saldo(c, j),
    }));
    return { catalogo: CATALOGO, tiene, equipado, partidas, saldo: monedas };
  });

  app.post<{ Params: { objeto: string } }>("/tienda/:objeto", async (req) => {
    const j = await quien(req);
    const objeto = esquemas.objeto.parse(req.params.objeto);
    const partidas = await partidasDe(j);
    return comoMonedas(o.base, async (c) => {
      const resultado = await conseguir(c, j, objeto, partidas);
      return { resultado, saldo: await saldo(c, j) };
    });
  });

  app.patch("/yo/equipado", async (req) => {
    const j = await quien(req);
    const cambio = esquemas.equipado.parse(req.body) as Equipado;
    const tiene = await comoMonedas(o.base, (c) => inventario(c, j));
    return comoJugador(o.base, j, async (c) => {
      const { rows } = await c.query<{ equipado: Equipado }>("SELECT equipado FROM jugadores WHERE id = $1", [
        j,
      ]);
      const nuevo = revisarEquipo(rows[0]?.equipado ?? {}, cambio, tiene);
      await c.query("UPDATE jugadores SET equipado = $2 WHERE id = $1", [j, JSON.stringify(nuevo)]);
      return { equipado: nuevo };
    });
  });

  return app;
}
