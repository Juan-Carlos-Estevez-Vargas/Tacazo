/**
 * Monedas: libro de doble entrada, salas por nivel, premio diario y cosméticos.
 *
 * Solo el servidor mueve monedas y siempre con una clave única, así que repetir
 * una petición (doble toque, reintento de red) no cobra ni paga dos veces. El
 * cliente pide acciones ("entrar a la sala club"), nunca manda montos.
 */
import { comoRol, type Base, type Consulta } from "./db.js";

export type Sistema = "emision" | "mesa" | "tienda";
export type TipoMovimiento =
  "bienvenida" | "diario" | "entrada" | "premio" | "devolucion" | "anuncio" | "compra" | "ajuste";

export type Asiento =
  | { readonly jugador: string; readonly monto: number }
  | { readonly sistema: Sistema; readonly monto: number };

export interface Movimiento {
  readonly clave: string;
  readonly tipo: TipoMovimiento;
  readonly asientos: readonly Asiento[];
}

export class SaldoInsuficiente extends Error {
  constructor() {
    super("No te alcanzan las monedas");
  }
}

export const comoMonedas = <T>(base: Base, fn: (c: Consulta) => Promise<T>) =>
  comoRol(base, "tacazo_monedas", null, fn);

/**
 * Registra un movimiento. Devuelve false si esa clave ya estaba (no hace nada).
 * Debe correr dentro de una transacción con el rol `tacazo_monedas`: si algún
 * jugador queda en negativo, la base deshace todo al cerrar.
 */
export async function mover(c: Consulta, m: Movimiento): Promise<boolean> {
  if (m.asientos.length < 2) throw new Error("Un movimiento necesita al menos dos asientos");
  let total = 0;
  for (const a of m.asientos) {
    if (!Number.isSafeInteger(a.monto) || a.monto === 0) throw new Error("Monto inválido");
    total += a.monto;
  }
  if (total !== 0) throw new Error("El movimiento no suma cero");
  const { rows } = await c.query<{ id: string }>(
    "INSERT INTO movimientos (clave, tipo) VALUES ($1, $2) ON CONFLICT (clave) DO NOTHING RETURNING id",
    [m.clave, m.tipo],
  );
  const id = rows[0]?.id;
  if (!id) return false;
  // Bloquear a los jugadores en el mismo orden siempre: dos cobros a la vez al
  // mismo jugador se hacen uno detrás del otro y sin interbloqueos.
  const jugadores = [...new Set(m.asientos.flatMap((a) => ("jugador" in a ? [a.jugador] : [])))].sort();
  if (jugadores.length)
    await c.query("SELECT id FROM jugadores WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE", [jugadores]);
  for (const a of m.asientos) {
    await c.query("INSERT INTO asientos (movimiento, jugador, sistema, monto) VALUES ($1, $2, $3, $4)", [
      id,
      "jugador" in a ? a.jugador : null,
      "sistema" in a ? a.sistema : null,
      a.monto,
    ]);
  }
  // La base también lo revisa al cerrar; aquí se avisa con un error claro.
  for (const j of jugadores) if ((await saldo(c, j)) < 0) throw new SaldoInsuficiente();
  return true;
}

export async function saldo(c: Consulta, jugador: string): Promise<number> {
  const { rows } = await c.query<{ saldo: string | number | null }>(
    "SELECT coalesce(sum(monto), 0) AS saldo FROM asientos WHERE jugador = $1",
    [jugador],
  );
  return Number(rows[0]?.saldo ?? 0);
}

/** Pago del sistema a un jugador. */
export const pagar = (jugador: string, monto: number, desde: Sistema): Asiento[] => [
  { sistema: desde, monto: -monto },
  { jugador, monto },
];

// ---------- Reglas de la economía ----------

export const BIENVENIDA = 500;
export const PREMIO_DIARIO = 100;

export interface SalaNivel {
  readonly id: string;
  readonly nombre: string;
  readonly entrada: number;
  /** Lo que gana el ganador; menos que el doble de la entrada para frenar la inflación. */
  readonly premio: number;
}

export const SALAS: readonly SalaNivel[] = [
  { id: "barrio", nombre: "Billar de barrio", entrada: 50, premio: 90 },
  { id: "club", nombre: "Club", entrada: 200, premio: 360 },
  { id: "campeonato", nombre: "Campeonato", entrada: 1000, premio: 1800 },
];

export const salaPorId = (id: string): SalaNivel | undefined => SALAS.find((s) => s.id === id);

/** Día del calendario en Colombia (UTC−5), para que el premio diario cambie a medianoche local. */
export function diaLocal(ms: number): string {
  return new Date(ms - 5 * 3_600_000).toISOString().slice(0, 10);
}

export const darBienvenida = (c: Consulta, jugador: string) =>
  mover(c, {
    clave: `bienvenida:${jugador}`,
    tipo: "bienvenida",
    asientos: pagar(jugador, BIENVENIDA, "emision"),
  });

/** Premio diario: una vez por día local. Devuelve false si ya lo cobró hoy. */
export const cobrarDiario = (c: Consulta, jugador: string, ahora: number) =>
  mover(c, {
    clave: `diario:${jugador}:${diaLocal(ahora)}`,
    tipo: "diario",
    asientos: pagar(jugador, PREMIO_DIARIO, "emision"),
  });

/** Cobra la entrada de una sala clasificatoria. Lanza SaldoInsuficiente si no alcanza. */
export function cobrarEntrada(
  c: Consulta,
  partida: string,
  jugador: string,
  sala: SalaNivel,
): Promise<boolean> {
  return mover(c, {
    clave: `entrada:${partida}:${jugador}`,
    tipo: "entrada",
    asientos: [
      { jugador, monto: -sala.entrada },
      { sistema: "mesa", monto: sala.entrada },
    ],
  });
}

/** Paga al ganador. Lo que sobra de las dos entradas se retira de circulación (sumidero). */
export function pagarPremio(
  c: Consulta,
  partida: string,
  ganador: string,
  sala: SalaNivel,
): Promise<boolean> {
  return mover(c, {
    clave: `premio:${partida}`,
    tipo: "premio",
    asientos: pagar(ganador, sala.premio, "mesa"),
  });
}

/** Devuelve la entrada (partida que no se jugó o terminó sin ganador). */
export function devolverEntrada(
  c: Consulta,
  partida: string,
  jugador: string,
  sala: SalaNivel,
): Promise<boolean> {
  return mover(c, {
    clave: `devolucion:${partida}:${jugador}`,
    tipo: "devolucion",
    asientos: pagar(jugador, sala.entrada, "mesa"),
  });
}

// ---------- Cosméticos ----------

export type Ranura = "taco" | "pano" | "marco";

export interface Objeto {
  readonly id: string;
  readonly ranura: Ranura;
  readonly nombre: string;
  /** Se compra con monedas, o se desbloquea con partidas clasificatorias jugadas. */
  readonly precio?: number;
  readonly partidas?: number;
}

export const CATALOGO: readonly Objeto[] = [
  { id: "taco_roble", ranura: "taco", nombre: "Taco de roble", precio: 0 },
  { id: "taco_laton", ranura: "taco", nombre: "Taco con virola de latón", precio: 600 },
  { id: "taco_ebano", ranura: "taco", nombre: "Taco de ébano", precio: 2500 },
  { id: "taco_veterano", ranura: "taco", nombre: "Taco del veterano", partidas: 100 },
  { id: "pano_verde", ranura: "pano", nombre: "Paño verde", precio: 0 },
  { id: "pano_azul", ranura: "pano", nombre: "Paño azul petróleo", precio: 800 },
  { id: "pano_vino", ranura: "pano", nombre: "Paño vino", precio: 800 },
  { id: "pano_torneo", ranura: "pano", nombre: "Paño de torneo", partidas: 50 },
  { id: "marco_madera", ranura: "marco", nombre: "Marco de madera", precio: 0 },
  { id: "marco_bronce", ranura: "marco", nombre: "Marco de bronce", partidas: 10 },
  { id: "marco_oro", ranura: "marco", nombre: "Marco de oro", precio: 5000 },
];

export const objetoPorId = (id: string) => CATALOGO.find((o) => o.id === id);

/** Objetos que el jugador tiene: los gratis más los del inventario. */
export async function inventario(c: Consulta, jugador: string): Promise<string[]> {
  const { rows } = await c.query<{ objeto: string }>("SELECT objeto FROM inventario WHERE jugador = $1", [
    jugador,
  ]);
  const gratis = CATALOGO.filter((o) => o.precio === 0).map((o) => o.id);
  return [...new Set([...gratis, ...rows.map((r) => r.objeto)])];
}

/**
 * Consigue un objeto: con monedas si tiene precio, o gratis si ya jugó las
 * partidas que pide. Corre con `tacazo_monedas`. Repetirlo no cobra dos veces.
 */
export async function conseguir(
  c: Consulta,
  jugador: string,
  objeto: string,
  partidasJugadas: number,
): Promise<"nuevo" | "ya"> {
  const o = objetoPorId(objeto);
  if (!o) throw new Error("Ese objeto no existe");
  if (o.precio === 0) return "ya";
  const ya = await c.query("SELECT 1 FROM inventario WHERE jugador = $1 AND objeto = $2", [jugador, o.id]);
  if (ya.rows.length) return "ya";
  if (o.partidas !== undefined) {
    if (partidasJugadas < o.partidas)
      throw new Error(`Se desbloquea con ${o.partidas} partidas clasificatorias`);
  } else {
    await mover(c, {
      clave: `compra:${jugador}:${o.id}`,
      tipo: "compra",
      asientos: [
        { jugador, monto: -o.precio! },
        { sistema: "tienda", monto: o.precio! },
      ],
    });
  }
  await c.query("INSERT INTO inventario (jugador, objeto) VALUES ($1, $2) ON CONFLICT DO NOTHING", [
    jugador,
    o.id,
  ]);
  return "nuevo";
}

/** Panel de fuentes y sumideros: monedas que entran y salen por día y tipo. */
export async function flujo(
  c: Consulta,
  dias = 30,
): Promise<{ dia: string; tipo: string; entran: number; salen: number; movimientos: number }[]> {
  const { rows } = await c.query<{
    dia: string | Date;
    tipo: string;
    entran: string | null;
    salen: string | null;
    movimientos: number;
  }>(
    `SELECT dia, tipo, entran, salen, movimientos FROM flujo_monedas
     WHERE dia > (now() - make_interval(days => $1))::date ORDER BY dia DESC, tipo`,
    [dias],
  );
  return rows.map((r) => ({
    dia: typeof r.dia === "string" ? r.dia.slice(0, 10) : r.dia.toISOString().slice(0, 10),
    tipo: r.tipo,
    entran: Number(r.entran ?? 0),
    salen: Number(r.salen ?? 0),
    movimientos: r.movimientos,
  }));
}

/** ¿Ya cobró el premio diario de hoy? */
export async function diarioCobrado(c: Consulta, jugador: string, ahora: number): Promise<boolean> {
  const { rows } = await c.query("SELECT 1 FROM movimientos WHERE clave = $1", [
    `diario:${jugador}:${diaLocal(ahora)}`,
  ]);
  return rows.length > 0;
}

/** Milisegundos hasta la próxima medianoche de Colombia. */
export function hastaManana(ahora: number): number {
  const dia = 86_400_000;
  const local = ahora - 5 * 3_600_000;
  return dia - (((local % dia) + dia) % dia);
}

export type Equipado = Partial<Record<Ranura, string>>;

/**
 * Revisa que lo que se quiere llevar puesto exista, vaya en su ranura y esté en
 * el inventario. Devuelve el equipo completo ya combinado con el anterior.
 */
export function revisarEquipo(actual: Equipado, cambio: Equipado, tiene: readonly string[]): Equipado {
  const nuevo: Equipado = { ...actual };
  for (const [ranura, id] of Object.entries(cambio) as [Ranura, string][]) {
    const o = objetoPorId(id);
    if (!o || o.ranura !== ranura) throw new Error("Ese objeto no va ahí");
    if (!tiene.includes(id)) throw new Error("Ese objeto todavía no es tuyo");
    nuevo[ranura] = id;
  }
  return nuevo;
}

export interface ResumenFlujo {
  /** Por tipo: lo que entró a jugadores y lo que salió de ellos. */
  readonly tipos: { tipo: string; entran: number; salen: number; movimientos: number }[];
  readonly entran: number;
  readonly salen: number;
  /** Positivo: la masa de monedas crece (inflación). */
  readonly neto: number;
}

/** Suma el flujo de varios días por tipo, para ver si la economía se infla. */
export function resumirFlujo(
  filas: readonly { tipo: string; entran: number; salen: number; movimientos: number }[],
): ResumenFlujo {
  const t = new Map<string, { tipo: string; entran: number; salen: number; movimientos: number }>();
  for (const f of filas) {
    const x = t.get(f.tipo) ?? { tipo: f.tipo, entran: 0, salen: 0, movimientos: 0 };
    x.entran += f.entran;
    x.salen += f.salen;
    x.movimientos += f.movimientos;
    t.set(f.tipo, x);
  }
  const tipos = [...t.values()].sort((a, b) => b.entran + b.salen - (a.entran + a.salen));
  const entran = tipos.reduce((s, x) => s + x.entran, 0);
  const salen = tipos.reduce((s, x) => s + x.salen, 0);
  return { tipos, entran, salen, neto: entran - salen };
}

/** Monedas en manos de jugadores y cuántos tienen saldo. */
export async function circulacion(c: Consulta): Promise<{ total: number; jugadores: number }> {
  const { rows } = await c.query<{ total: string | number | null; jugadores: string | number }>(
    "SELECT coalesce(sum(saldo), 0) AS total, count(*) FILTER (WHERE saldo > 0) AS jugadores FROM saldos",
  );
  return { total: Number(rows[0]?.total ?? 0), jugadores: Number(rows[0]?.jugadores ?? 0) };
}
