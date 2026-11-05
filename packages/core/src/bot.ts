import { datan2, DEG } from "./dmath.js";
import { cloneWorld, simulateShot, type Shot, type World } from "./physics.js";
import {
  ballsOnTable,
  canPlaceCueBall,
  judgeShot,
  legalTargets,
  needsCall,
  type Bola8State,
} from "./reglas/bola8.js";
import type { Rng } from "./rng.js";

/**
 * Bot de práctica de bola 8. Busca tiros con la bola fantasma (dónde tiene que
 * estar la blanca al tocar la bola objetivo para mandarla a una tronera),
 * simula los candidatos con el mismo motor y elige el mejor según las reglas.
 * Los niveles cambian cuántos tiros prueba y cuánto falla al apuntar.
 * Es determinista: con la misma semilla juega igual.
 */

export type BotLevel = "facil" | "medio" | "dificil";

interface LevelSpec {
  /** Candidatos que simula como mucho. */
  readonly candidates: number;
  /** Error de puntería (desviación máxima en grados). */
  readonly aimError: number;
  readonly powers: readonly number[];
  readonly spins: readonly number[];
}

const LEVELS: Record<BotLevel, LevelSpec> = {
  facil: { candidates: 6, aimError: 2.5, powers: [0.35], spins: [0] },
  medio: { candidates: 18, aimError: 0.8, powers: [0.25, 0.45], spins: [0, 0.4] },
  dificil: { candidates: 40, aimError: 0.15, powers: [0.2, 0.35, 0.6], spins: [0, 0.5, -0.5] },
};

export interface BotMove {
  /** Dónde deja la blanca si tiene bola en mano. */
  readonly place?: { readonly x: number; readonly y: number };
  readonly shot: Shot;
  readonly call: { readonly pocket?: number };
}

interface Candidate {
  readonly angle: number;
  readonly pocket: number;
  /** Menor es mejor: corte y distancias. */
  readonly difficulty: number;
}

function aimCandidates(w: World, s: Bola8State, cueX: number, cueY: number): Candidate[] {
  const R = w.table.ballRadius;
  const on = ballsOnTable(w);
  const targets = legalTargets(s, on);
  const out: Candidate[] = [];
  for (const id of targets) {
    const b = w.balls.find((x) => x.id === id)!;
    w.table.pockets.forEach((p, pocket) => {
      const tx = p.center.x - b.x;
      const ty = p.center.y - b.y;
      const tl = Math.sqrt(tx * tx + ty * ty);
      const gx = b.x - (2 * R * tx) / tl;
      const gy = b.y - (2 * R * ty) / tl;
      const ax = gx - cueX;
      const ay = gy - cueY;
      const al = Math.sqrt(ax * ax + ay * ay);
      if (al < 1e-6) return;
      // Coseno del corte: 1 = de frente, 0 = imposible.
      const cut = (ax * tx + ay * ty) / (al * tl);
      if (cut < 0.2) return;
      out.push({ angle: datan2(ay, ax), pocket, difficulty: (1 / cut) * (al + tl) });
    });
  }
  return out.sort((a, b) => a.difficulty - b.difficulty || a.angle - b.angle);
}

function score(s: Bola8State, w: World, move: BotMove): number {
  const sim = cloneWorld(w);
  const before = ballsOnTable(sim);
  const res = simulateShot(sim, move.shot);
  const v = judgeShot(s, before, res.events, move.call);
  const me = s.turn;
  if (v.state.phase === "terminada") return v.state.winner === me ? 10000 : -10000;
  let points = 0;
  if (v.fouls.length) points -= 300;
  if (v.keepsTurn) points += 200;
  const g = v.state.groups[me];
  points +=
    20 * v.pocketed.filter((id) => g !== null && (id >= 1 && id <= 7 ? "lisas" : "rayadas") === g).length;
  return points;
}

/** Busca dónde dejar la blanca con bola en mano: detrás de un tiro recto fácil. */
function choosePlacement(w: World, s: Bola8State, rng: Rng): { x: number; y: number } {
  const hand = s.ballInHand;
  const { width, height, ballRadius: R, headStringX } = w.table;
  const maxX = hand === "cabecera" ? headStringX : width - R;
  const on = ballsOnTable(w);
  for (const id of legalTargets(s, on)) {
    const b = w.balls.find((x) => x.id === id)!;
    for (const p of w.table.pockets) {
      const tx = b.x - p.center.x;
      const ty = b.y - p.center.y;
      const tl = Math.sqrt(tx * tx + ty * ty);
      for (const back of [0.25, 0.4, 0.6]) {
        const x = b.x + (tx / tl) * back;
        const y = b.y + (ty / tl) * back;
        if (x <= maxX && canPlaceCueBall(w, hand, x, y)) return { x, y };
      }
    }
  }
  for (let i = 0; i < 200; i++) {
    const x = R + rng.next() * (maxX - 2 * R);
    const y = R + rng.next() * (height - 2 * R);
    if (canPlaceCueBall(w, hand, x, y)) return { x, y };
  }
  return { x: headStringX / 2, y: height / 2 };
}

/** Decide el siguiente tiro del bot. No modifica `w`. */
export function botMove(w: World, s: Bola8State, level: BotLevel, rng: Rng): BotMove {
  const spec = LEVELS[level];
  let world = w;
  let place: { x: number; y: number } | undefined;
  if (s.ballInHand !== "no") {
    place = choosePlacement(w, s, rng);
    world = cloneWorld(w);
    const cue = world.balls.find((b) => b.id === 0)!;
    cue.x = place.x;
    cue.y = place.y;
    cue.onTable = true;
    cue.vx = cue.vy = cue.wx = cue.wy = cue.wz = 0;
  }
  const cue = world.balls.find((b) => b.id === 0)!;
  const noise = () => (rng.next() * 2 - 1) * spec.aimError * DEG;
  const withPlace = (m: Omit<BotMove, "place">): BotMove => (place ? { ...m, place } : m);

  if (s.phase === "saque") {
    const apex = world.balls.find((b) => b.id !== 0 && b.onTable)!;
    let best = apex;
    for (const b of world.balls) if (b.id !== 0 && b.onTable && b.x < best.x) best = b;
    return withPlace({
      shot: {
        angle: datan2(best.y - cue.y, best.x - cue.x) + noise() * 0.3,
        power: 1,
        side: 0,
        top: 0,
        elevation: 0,
      },
      call: {},
    });
  }

  const call = needsCall(s, ballsOnTable(world));
  const aims = aimCandidates(world, s, cue.x, cue.y);
  let bestMove: BotMove | null = null;
  let bestScore = -Infinity;
  let tried = 0;
  outer: for (const a of aims)
    for (const power of spec.powers)
      for (const top of spec.spins) {
        if (tried++ >= spec.candidates) break outer;
        const move = withPlace({
          shot: { angle: a.angle, power, side: 0, top, elevation: 0 },
          call: call ? { pocket: a.pocket } : {},
        });
        const sc = score(s, world, move);
        if (sc > bestScore) {
          bestScore = sc;
          bestMove = move;
        }
      }
  if (!bestMove) {
    // Sin tiro limpio: toca la bola legal más cercana para no hacer falta.
    const on = ballsOnTable(world);
    const targets = legalTargets(s, on).map((id) => world.balls.find((b) => b.id === id)!);
    targets.sort(
      (a, b) => (a.x - cue.x) ** 2 + (a.y - cue.y) ** 2 - ((b.x - cue.x) ** 2 + (b.y - cue.y) ** 2),
    );
    const t = targets[0];
    const angle = t ? datan2(t.y - cue.y, t.x - cue.x) : 0;
    bestMove = withPlace({ shot: { angle, power: 0.4, side: 0, top: 0, elevation: 0 }, call: {} });
  }
  return { ...bestMove, shot: { ...bestMove.shot, angle: bestMove.shot.angle + noise() } };
}
