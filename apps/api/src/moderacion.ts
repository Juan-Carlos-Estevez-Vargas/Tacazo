/**
 * Reportes, revisiones, sanciones escalonadas y apelaciones.
 *
 * Nada se sanciona solo: las señales y los reportes abren un caso, y una
 * persona de moderación decide viendo las repeticiones.
 */
import { ENGINE_VERSION, type Repeticion } from "@tacazo/core";
import { comoRol, type Base, type Consulta } from "./db.js";
import { evaluar, muestrasVacias, muestrear, type Muestras, type Senal, type Umbrales } from "./senales.js";

export const MOTIVOS = ["trampa", "nombre", "abandono", "otro"] as const;
export type MotivoReporte = (typeof MOTIVOS)[number];
export const REPORTES_POR_DIA = 10;
/** Autores distintos que reportan trampa en 30 días para abrir un caso. */
export const AUTORES_PARA_REVISION = 3;
/** Días hacia atrás que mira el trabajo nocturno. */
export const VENTANA_DIAS = 7;

export const NIVELES = {
  1: { nombre: "Aviso", duracionDias: 0, juega: true, clasifica: true },
  2: { nombre: "Un día sin clasificatorias", duracionDias: 1, juega: true, clasifica: false },
  3: { nombre: "Siete días sin jugar", duracionDias: 7, juega: false, clasifica: false },
  4: { nombre: "Cuenta cerrada", duracionDias: null, juega: false, clasifica: false },
} as const;
export type Nivel = keyof typeof NIVELES;

const DIA_MS = 86_400_000;

export const comoModeracion = <T>(base: Base, fn: (c: Consulta) => Promise<T>) =>
  comoRol(base, "tacazo_moderacion", null, fn);

/** Reporte de un jugador. Corre dentro de `comoJugador(autor)`. */
export async function reportar(
  c: Consulta,
  autor: string,
  r: { partida: string; reportado: string; motivo: MotivoReporte; detalle?: string | undefined },
): Promise<string> {
  if (!MOTIVOS.includes(r.motivo)) throw new Error("Motivo inválido");
  const detalle = r.detalle?.trim().slice(0, 500) || null;
  const { rows: hoy } = await c.query<{ n: number }>(
    "SELECT count(*)::integer AS n FROM reportes WHERE autor = $1 AND creado > now() - interval '1 day'",
    [autor],
  );
  if (hoy[0]!.n >= REPORTES_POR_DIA) throw new Error("Ya enviaste muchos reportes hoy");
  const { rows } = await c.query<{ id: string }>(
    `INSERT INTO reportes (autor, reportado, partida, motivo, detalle) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (autor, partida) DO NOTHING RETURNING id`,
    [autor, r.reportado, r.partida, r.motivo, detalle],
  );
  if (!rows[0]) throw new Error("Ya reportaste esta partida");
  return rows[0].id;
}

/** Abre un caso o suma al que el jugador ya tiene abierto. */
export async function abrirRevision(
  c: Consulta,
  jugador: string,
  origen: "senales" | "reportes",
  senales: readonly Senal[],
  puntaje: number,
  partidas: readonly string[],
): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    `INSERT INTO revisiones (jugador, origen, senales, puntaje, partidas)
     VALUES ($1, $2, $3, $4, $5::uuid[])
     ON CONFLICT (jugador) WHERE estado = 'pendiente' DO UPDATE SET
       senales = EXCLUDED.senales,
       puntaje = greatest(revisiones.puntaje, EXCLUDED.puntaje),
       partidas = ARRAY(SELECT DISTINCT unnest(revisiones.partidas || EXCLUDED.partidas))
     RETURNING id`,
    [jugador, origen, JSON.stringify(senales), puntaje, partidas],
  );
  return rows[0]!.id;
}

/** Siguiente escalón: uno más que las sanciones vigentes del último año. */
export async function siguienteNivel(c: Consulta, jugador: string): Promise<Nivel> {
  const { rows } = await c.query<{ n: number }>(
    `SELECT count(*)::integer AS n FROM sanciones
     WHERE jugador = $1 AND NOT levantada AND desde > now() - interval '365 days'`,
    [jugador],
  );
  return Math.min(4, rows[0]!.n + 1) as Nivel;
}

/** Cierra un caso con sanción. Devuelve el id y el nivel aplicado. */
export async function sancionar(
  c: Consulta,
  revision: string,
  revisor: string,
  motivo: string,
  ahora = Date.now(),
): Promise<{ id: string; nivel: Nivel }> {
  const { rows } = await c.query<{ jugador: string }>(
    "UPDATE revisiones SET estado = 'sancionado', revisor = $2, nota = $3, resuelta = now() WHERE id = $1 AND estado = 'pendiente' RETURNING jugador",
    [revision, revisor, motivo],
  );
  const jugador = rows[0]?.jugador;
  if (!jugador) throw new Error("La revisión no existe o ya se resolvió");
  const nivel = await siguienteNivel(c, jugador);
  const dias = NIVELES[nivel].duracionDias;
  const hasta = dias === null ? null : new Date(ahora + dias * DIA_MS).toISOString();
  const { rows: s } = await c.query<{ id: string }>(
    "INSERT INTO sanciones (jugador, nivel, motivo, revision, desde, hasta) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    [jugador, nivel, motivo, revision, new Date(ahora).toISOString(), hasta],
  );
  return { id: s[0]!.id, nivel };
}

/** Cierra un caso sin sanción. */
export async function descartar(c: Consulta, revision: string, revisor: string, nota: string): Promise<void> {
  const { rows } = await c.query(
    "UPDATE revisiones SET estado = 'limpio', revisor = $2, nota = $3, resuelta = now() WHERE id = $1 AND estado = 'pendiente' RETURNING id",
    [revision, revisor, nota],
  );
  if (!rows[0]) throw new Error("La revisión no existe o ya se resolvió");
}

/** El jugador apela su sanción, una sola vez y dentro de 14 días. Corre en `comoJugador`. */
export async function apelar(c: Consulta, sancion: string, texto: string): Promise<void> {
  const t = texto.trim();
  if (t.length < 10) throw new Error("Cuéntanos un poco más (mínimo 10 caracteres)");
  const { rows } = await c.query(
    `UPDATE sanciones SET apelacion = $2, apelada = now(), apelacion_estado = 'pendiente'
     WHERE id = $1 RETURNING id`,
    [sancion, t.slice(0, 1000)],
  );
  if (!rows[0]) throw new Error("Esta sanción no se puede apelar");
}

/** Moderación responde una apelación; si se acepta, la sanción deja de contar. */
export async function resolverApelacion(c: Consulta, sancion: string, aceptada: boolean): Promise<void> {
  const { rows } = await c.query(
    `UPDATE sanciones SET apelacion_estado = $2, levantada = $3
     WHERE id = $1 AND apelacion_estado = 'pendiente' RETURNING id`,
    [sancion, aceptada ? "aceptada" : "rechazada", aceptada],
  );
  if (!rows[0]) throw new Error("No hay una apelación pendiente con ese id");
}

/** Qué puede hacer hoy un jugador según sus sanciones vigentes. */
export async function restricciones(
  c: Consulta,
  jugador: string,
): Promise<{ juega: boolean; clasifica: boolean; hasta: string | null }> {
  const { rows } = await c.query<{ nivel: Nivel; hasta: string | null }>(
    `SELECT nivel, hasta FROM sanciones
     WHERE jugador = $1 AND NOT levantada AND nivel > 1 AND (hasta IS NULL OR hasta > now())
     ORDER BY nivel DESC LIMIT 1`,
    [jugador],
  );
  const s = rows[0];
  if (!s) return { juega: true, clasifica: true, hasta: null };
  const n = NIVELES[s.nivel];
  return { juega: n.juega, clasifica: n.clasifica, hasta: s.hasta ? new Date(s.hasta).toISOString() : null };
}

/**
 * Trabajo nocturno: mira las partidas clasificatorias de los últimos días,
 * calcula las señales de cada jugador y abre casos. También abre caso a quien
 * acumula reportes de trampa de varias personas. Corre como `tacazo_moderacion`.
 * La silla 0 de la repetición es `jugador_a`.
 */
export async function trabajoNocturno(
  c: Consulta,
  u: Umbrales,
): Promise<{ revisados: number; casos: number; fallidas: number }> {
  const { rows } = await c.query<{
    id: string;
    jugador_a: string;
    jugador_b: string;
    repeticion: Repeticion;
  }>(
    `SELECT id, jugador_a, jugador_b, repeticion FROM partidas
     WHERE clasificatoria AND terminada > now() - make_interval(days => $1)`,
    [VENTANA_DIAS],
  );
  const porJugador = new Map<string, { m: Muestras; partidas: string[] }>();
  let fallidas = 0;
  for (const p of rows) {
    const rep = typeof p.repeticion === "string" ? (JSON.parse(p.repeticion) as Repeticion) : p.repeticion;
    // Con otro motor la física cambia: esas partidas no se pueden medir.
    if (rep.motor !== ENGINE_VERSION) {
      fallidas++;
      continue;
    }
    for (const [silla, jugador] of [
      [0, p.jugador_a],
      [1, p.jugador_b],
    ] as const) {
      let x = porJugador.get(jugador);
      if (!x) porJugador.set(jugador, (x = { m: muestrasVacias(), partidas: [] }));
      try {
        muestrear(rep, silla, x.m);
        x.partidas.push(p.id);
      } catch {
        // Las repeticiones las escribe el servidor; si una no se reproduce es un
        // error nuestro (por ejemplo, otra versión del motor), no del jugador.
        fallidas++;
      }
    }
  }
  let casos = 0;
  for (const [jugador, { m, partidas }] of porJugador) {
    const e = evaluar(m, u);
    if (e.revisar) {
      await abrirRevision(c, jugador, "senales", e.senales, e.puntaje, partidas);
      casos++;
    }
  }
  const { rows: reportados } = await c.query<{ reportado: string; partidas: string[] }>(
    `SELECT reportado, array_agg(DISTINCT partida) AS partidas FROM reportes
     WHERE motivo = 'trampa' AND creado > now() - interval '30 days'
     GROUP BY reportado HAVING count(DISTINCT autor) >= $1`,
    [AUTORES_PARA_REVISION],
  );
  for (const r of reportados) {
    await abrirRevision(c, r.reportado, "reportes", [], 0, r.partidas);
    casos++;
  }
  return { revisados: porJugador.size, casos, fallidas };
}
