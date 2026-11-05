import type { SimEvent, World } from "../physics.js";

/**
 * Reglas de bola 8 (basadas en las reglas mundiales de pool, simplificadas
 * para jugar en línea). El motor de reglas no simula nada: recibe la lista de
 * eventos que dio la física y decide faltas, turno y ganador. Así la física se
 * puede cambiar sin tocar las reglas y al revés.
 *
 * - Ids: 0 blanca, 1-7 lisas, 8 la negra, 9-15 rayadas.
 * - Solo se canta tronera para la 8.
 */

export type Group = "lisas" | "rayadas";
export type Player = 0 | 1;
export type BallInHand = "no" | "cabecera" | "cualquiera";

export type Foul =
  "blanca-en-tronera" | "sin-contacto" | "primera-bola-incorrecta" | "sin-banda" | "saque-ilegal";

export type LossReason = "8-antes-de-tiempo" | "8-en-otra-tronera" | "8-con-falta" | "8-sin-cantar";

export interface Bola8State {
  readonly phase: "saque" | "juego" | "terminada";
  readonly turn: Player;
  /** Grupo de cada jugador; null mientras la mesa esté abierta. */
  readonly groups: readonly [Group | null, Group | null];
  readonly ballInHand: BallInHand;
  readonly winner: Player | null;
  readonly loss: LossReason | null;
}

export interface ShotCall {
  /** Tronera cantada para la 8 (índice en `table.pockets`). */
  readonly pocket?: number;
}

export interface ShotVerdict {
  readonly state: Bola8State;
  readonly fouls: readonly Foul[];
  /** El mismo jugador sigue tirando. */
  readonly keepsTurn: boolean;
  /** Bolas que hay que volver a poner en la mesa (la 8 si cayó en el saque). */
  readonly respot: readonly number[];
  readonly pocketed: readonly number[];
}

export const groupOf = (id: number): Group | null =>
  id >= 1 && id <= 7 ? "lisas" : id >= 9 && id <= 15 ? "rayadas" : null;

const other = (p: Player): Player => (p === 0 ? 1 : 0);
const otherGroup = (g: Group): Group => (g === "lisas" ? "rayadas" : "lisas");

export function newGame(breaker: Player = 0): Bola8State {
  return {
    phase: "saque",
    turn: breaker,
    groups: [null, null],
    ballInHand: "cabecera",
    winner: null,
    loss: null,
  };
}

/** ¿Al jugador le toca la 8? (ya metió todas las de su grupo). */
export function onTheEight(s: Bola8State, ballsOnTable: readonly number[], p: Player = s.turn): boolean {
  const g = s.groups[p];
  return g !== null && !ballsOnTable.some((id) => groupOf(id) === g);
}

/** Bolas que el jugador en turno puede tocar primero. */
export function legalTargets(s: Bola8State, ballsOnTable: readonly number[]): number[] {
  const objects = ballsOnTable.filter((id) => id !== 0);
  if (s.phase === "saque") return objects;
  const g = s.groups[s.turn];
  if (g === null) return objects.filter((id) => id !== 8);
  if (onTheEight(s, ballsOnTable)) return objects.filter((id) => id === 8);
  return objects.filter((id) => groupOf(id) === g);
}

/** ¿El jugador tiene que cantar tronera en este tiro? */
export function needsCall(s: Bola8State, ballsOnTable: readonly number[]): boolean {
  return s.phase === "juego" && onTheEight(s, ballsOnTable);
}

/**
 * Decide el resultado de un tiro.
 * @param before ids en la mesa antes del tiro (incluida la blanca).
 * @param events eventos de la física de este tiro, en orden.
 */
export function judgeShot(
  s: Bola8State,
  before: readonly number[],
  events: readonly SimEvent[],
  call: ShotCall = {},
): ShotVerdict {
  if (s.phase === "terminada") throw new Error("La partida ya terminó");
  const me = s.turn;
  const pockets = events.filter((e) => e.kind === "pocket");
  const pocketed = pockets.map((e) => e.ball);
  const objectsIn = pocketed.filter((id) => id !== 0);
  const scratch = pocketed.includes(0);
  const firstHitIdx = events.findIndex((e) => e.kind === "ball" && (e.a === 0 || e.b === 0));
  const firstHitEvent = events[firstHitIdx];
  const firstHit =
    firstHitEvent && firstHitEvent.kind === "ball"
      ? firstHitEvent.a === 0
        ? firstHitEvent.b
        : firstHitEvent.a
      : null;
  const railAfter =
    firstHitIdx >= 0 &&
    events.slice(firstHitIdx + 1).some((e) => e.kind === "cushion" || e.kind === "pocket");

  const fouls: Foul[] = [];
  if (scratch) fouls.push("blanca-en-tronera");

  // --- Saque ---
  if (s.phase === "saque") {
    const railBalls = new Set(events.flatMap((e) => (e.kind === "cushion" && e.ball !== 0 ? [e.ball] : [])));
    const legalBreak = objectsIn.length > 0 || railBalls.size >= 4;
    if (firstHit === null) fouls.push("sin-contacto");
    else if (!legalBreak) fouls.push("saque-ilegal");
    const eightIn = objectsIn.includes(8);
    const foul = fouls.length > 0;
    const scored = objectsIn.some((id) => id !== 8);
    const keepsTurn = !foul && scored;
    return {
      state: {
        ...s,
        phase: "juego",
        turn: keepsTurn ? me : other(me),
        ballInHand: foul ? "cabecera" : "no",
      },
      fouls,
      keepsTurn,
      respot: eightIn ? [8] : [],
      pocketed,
    };
  }

  // --- Juego ---
  const myGroup = s.groups[me];
  const wasOnEight = onTheEight(s, before);
  const legal = legalTargets(s, before);
  if (firstHit === null) fouls.push("sin-contacto");
  else if (!legal.includes(firstHit)) fouls.push("primera-bola-incorrecta");
  if (firstHit !== null && objectsIn.length === 0 && !railAfter) fouls.push("sin-banda");
  const foul = fouls.length > 0;

  // La 8.
  if (objectsIn.includes(8)) {
    const eightEvent = pockets.find((e) => e.ball === 8);
    const eightPocket = eightEvent && eightEvent.kind === "pocket" ? eightEvent.pocket : -1;
    let loss: LossReason | null = null;
    if (!wasOnEight) loss = "8-antes-de-tiempo";
    else if (foul) loss = "8-con-falta";
    else if (call.pocket === undefined) loss = "8-sin-cantar";
    else if (call.pocket !== eightPocket) loss = "8-en-otra-tronera";
    return {
      state: { ...s, phase: "terminada", winner: loss ? other(me) : me, loss, ballInHand: "no" },
      fouls,
      keepsTurn: false,
      respot: [],
      pocketed,
    };
  }

  // Grupos: en mesa abierta, la primera bola metida legalmente decide.
  let groups = s.groups;
  if (!foul && myGroup === null) {
    const first = objectsIn.map(groupOf).find((g) => g !== null);
    if (first) groups = me === 0 ? [first, otherGroup(first)] : [otherGroup(first), first];
  }
  const g = groups[me];
  const scoredOwn = g !== null && objectsIn.some((id) => groupOf(id) === g);
  const keepsTurn = !foul && scoredOwn;
  return {
    state: {
      ...s,
      groups,
      turn: keepsTurn ? me : other(me),
      ballInHand: foul ? "cualquiera" : "no",
    },
    fouls,
    keepsTurn,
    respot: [],
    pocketed,
  };
}

/** ¿Se puede dejar la blanca en (x, y) con bola en mano? */
export function canPlaceCueBall(w: World, hand: BallInHand, x: number, y: number): boolean {
  if (hand === "no") return false;
  const { ballRadius: R, width, height, headStringX } = w.table;
  if (!(x >= R && x <= width - R && y >= R && y <= height - R)) return false;
  if (hand === "cabecera" && x > headStringX) return false;
  return w.balls.every((b) => b.id === 0 || !b.onTable || (b.x - x) ** 2 + (b.y - y) ** 2 >= (2 * R) ** 2);
}

/** Pone la blanca con bola en mano. Lanza error si el sitio no vale. */
export function placeCueBall(w: World, hand: BallInHand, x: number, y: number): void {
  if (!canPlaceCueBall(w, hand, x, y)) throw new Error("No se puede dejar la blanca ahí");
  const cue = w.balls.find((b) => b.id === 0);
  if (!cue) throw new Error("No hay blanca");
  cue.x = x;
  cue.y = y;
  cue.vx = cue.vy = cue.wx = cue.wy = cue.wz = 0;
  cue.onTable = true;
}

/**
 * Vuelve a poner una bola en el punto de pie; si está ocupado, en el primer
 * hueco libre hacia la banda de pie.
 */
export function spotBall(w: World, id: number): void {
  const b = w.balls.find((x) => x.id === id);
  if (!b) throw new Error(`No existe la bola ${id}`);
  const R = w.table.ballRadius;
  const { footSpot, width } = w.table;
  const free = (x: number) =>
    w.balls.every((o) => o === b || !o.onTable || (o.x - x) ** 2 + (o.y - footSpot.y) ** 2 >= (2 * R) ** 2);
  let x = footSpot.x;
  while (x <= width - R && !free(x)) x += R / 4;
  if (x > width - R) {
    x = footSpot.x;
    while (x >= R && !free(x)) x -= R / 4;
  }
  b.x = x;
  b.y = footSpot.y;
  b.vx = b.vy = b.wx = b.wy = b.wz = 0;
  b.onTable = true;
}

/** Ids en la mesa. */
export const ballsOnTable = (w: World): number[] => w.balls.filter((b) => b.onTable).map((b) => b.id);
