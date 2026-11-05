import { DEG, PI, dcos, dln, dsin } from "./dmath.js";
import type { TableSpec } from "./table.js";

/**
 * Motor de física de Tacazo.
 *
 * - Paso fijo de 1/480 s. Dentro de cada paso los choques se buscan por tiempo
 *   de impacto (detección continua): ninguna bola atraviesa a otra ni una goma.
 * - Cada bola tiene velocidad (vx, vy) y giro (wx, wy, wz). El paño frena por
 *   deslizamiento hasta que la bola rueda; luego frena por rodadura. El giro
 *   vertical (wz) es el efecto lateral.
 * - Solo + - * / y Math.sqrt: el mismo tiro da el mismo resultado, bit a bit,
 *   en el servidor, en el navegador y en las repeticiones.
 * - Masa 1 para todas las bolas de una mesa; momento de inercia 2/5·R².
 */

export const STEP = 1 / 480;
export const GRAVITY = 9.81;
/** Tope de pasos de un tiro (60 s); si se alcanza, las bolas se detienen. */
export const MAX_STEPS = 480 * 60;

export interface Ball {
  readonly id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  wx: number;
  wy: number;
  wz: number;
  onTable: boolean;
}

export interface BallInit {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

export type SimEvent =
  | {
      readonly kind: "ball";
      readonly step: number;
      readonly a: number;
      readonly b: number;
      readonly speed: number;
    }
  | { readonly kind: "cushion"; readonly step: number; readonly ball: number; readonly speed: number }
  | { readonly kind: "pocket"; readonly step: number; readonly ball: number; readonly pocket: number };

export interface World {
  readonly table: TableSpec;
  readonly balls: Ball[];
  step: number;
  readonly events: SimEvent[];
}

/** Un tiro tal como lo manda el jugador. */
export interface Shot {
  /** Dirección del taco en radianes (0 = hacia +x). */
  readonly angle: number;
  /** 0 a 1. */
  readonly power: number;
  /** Efecto lateral, -1 (izquierda) a 1 (derecha). */
  readonly side: number;
  /** Efecto vertical, -1 (abajo, retroceso) a 1 (arriba, seguimiento). */
  readonly top: number;
  /** Inclinación del taco en grados, 0 a 70. Con efecto lateral produce curva. */
  readonly elevation: number;
}

export const MAX_ELEVATION = 70;
/** El taco toca como mucho a media bola del centro; más allá es pifia. */
export const MAX_TIP_OFFSET = 0.5;
/** Desvío de la blanca por efecto lateral, en radianes aproximados con efecto 1. */
const SQUIRT = 0.035;

export function createWorld(table: TableSpec, balls: readonly BallInit[]): World {
  return {
    table,
    balls: balls.map((b) => ({ id: b.id, x: b.x, y: b.y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, onTable: true })),
    step: 0,
    events: [],
  };
}

export function cloneWorld(w: World): World {
  return { table: w.table, balls: w.balls.map((b) => ({ ...b })), step: w.step, events: [...w.events] };
}

export interface ShotProblem {
  readonly field: keyof Shot | "cueBall";
  readonly message: string;
}

/** Revisa un tiro antes de aplicarlo. El servidor rechaza lo que no pase. */
export function validateShot(s: Shot): ShotProblem[] {
  const p: ShotProblem[] = [];
  const finite = (k: keyof Shot) => {
    if (!Number.isFinite(s[k])) p.push({ field: k, message: "Debe ser un número" });
  };
  (["angle", "power", "side", "top", "elevation"] as const).forEach(finite);
  if (p.length) return p;
  if (s.power < 0.02 || s.power > 1) p.push({ field: "power", message: "La potencia va de 0,02 a 1" });
  if (s.side * s.side + s.top * s.top > 1) p.push({ field: "side", message: "El taco se sale de la bola" });
  if (s.elevation < 0 || s.elevation > MAX_ELEVATION)
    p.push({ field: "elevation", message: `La inclinación va de 0 a ${MAX_ELEVATION}°` });
  return p;
}

/**
 * Golpe del taco sobre la blanca (id 0). Calcula velocidad y giro a partir de
 * dónde toca el taco y con qué inclinación.
 */
export function strike(w: World, shot: Shot): void {
  const problems = validateShot(shot);
  if (problems.length) throw new Error(`Tiro inválido: ${problems.map((x) => x.message).join("; ")}`);
  const cue = w.balls.find((b) => b.id === 0 && b.onTable);
  if (!cue) throw new Error("La blanca no está en la mesa");
  const R = w.table.ballRadius;
  const V = shot.power * w.table.cloth.maxSpeed;
  const dx = dcos(shot.angle);
  const dy = dsin(shot.angle);
  // n: perpendicular a la izquierda de la dirección del taco.
  const nx = -dy;
  const ny = dx;
  const s = shot.side * MAX_TIP_OFFSET * R;
  const b = shot.top * MAX_TIP_OFFSET * R;
  const c = Math.sqrt(R * R - s * s - b * b);
  const ce = dcos(shot.elevation * DEG);
  const se = dsin(shot.elevation * DEG);

  // El efecto a la derecha desvía la blanca un poco a la izquierda.
  let vx = dx + SQUIRT * shot.side * nx;
  let vy = dy + SQUIRT * shot.side * ny;
  const vl = Math.sqrt(vx * vx + vy * vy);
  vx = (vx / vl) * V * ce;
  vy = (vy / vl) * V * ce;

  // Momento angular del impulso J = V·(cos e·d − sin e·z) aplicado en
  // P = −c·d − s·n + b·z, dividido por I = 2/5·R².
  const k = (2.5 * V) / (R * R);
  const along = se * s; // componente sobre d: curva (massé)
  const across = ce * b - se * c; // componente sobre n: seguimiento o retroceso
  cue.vx = vx;
  cue.vy = vy;
  cue.wx = k * (across * nx + along * dx);
  cue.wy = k * (across * ny + along * dy);
  cue.wz = k * ce * s;
}

export function isMoving(b: Ball): boolean {
  return b.onTable && (b.vx !== 0 || b.vy !== 0 || b.wx !== 0 || b.wy !== 0 || b.wz !== 0);
}

export function atRest(w: World): boolean {
  return !w.balls.some(isMoving);
}

/** Energía cinética total (traslación + rotación), para las pruebas. */
export function kineticEnergy(w: World): number {
  const R = w.table.ballRadius;
  const I = 0.4 * R * R;
  let e = 0;
  for (const b of w.balls) {
    if (!b.onTable) continue;
    e += 0.5 * (b.vx * b.vx + b.vy * b.vy) + 0.5 * I * (b.wx * b.wx + b.wy * b.wy + b.wz * b.wz);
  }
  return e;
}

const SLIP_EPS = 1e-9;
const REST_SPEED = 1e-6;

/** Rozamiento del paño durante `dt`: deslizamiento, rodadura y giro vertical. */
function applyCloth(b: Ball, R: number, cloth: TableSpec["cloth"], dt: number): void {
  let rem = dt;
  let rolling = true;
  const ux = b.vx - R * b.wy;
  const uy = b.vy + R * b.wx;
  const u = Math.sqrt(ux * ux + uy * uy);
  if (u > SLIP_EPS) {
    const a = cloth.slideFriction * GRAVITY;
    const tEnd = u / (3.5 * a);
    const h = tEnd < rem ? tEnd : rem;
    const ex = ux / u;
    const ey = uy / u;
    b.vx -= a * h * ex;
    b.vy -= a * h * ey;
    b.wx -= ((2.5 * a) / R) * ey * h;
    b.wy += ((2.5 * a) / R) * ex * h;
    rem -= h;
    rolling = h === tEnd;
  }
  if (rolling) {
    // Rueda sin resbalar: solo la rodadura la frena.
    const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    const dv = cloth.rollFriction * GRAVITY * rem;
    if (speed <= dv || speed < REST_SPEED) {
      b.vx = 0;
      b.vy = 0;
    } else {
      const f = (speed - dv) / speed;
      b.vx *= f;
      b.vy *= f;
    }
    b.wy = b.vx / R;
    b.wx = -b.vy / R;
  }
  if (b.wz !== 0) {
    const d = cloth.spinDecel * dt;
    if (b.wz > d) b.wz -= d;
    else if (b.wz < -d) b.wz += d;
    else b.wz = 0;
  }
}

type Hit =
  | { readonly t: number; readonly kind: "ball"; readonly i: number; readonly j: number }
  | {
      readonly t: number;
      readonly kind: "wall";
      readonly i: number;
      readonly nx: number;
      readonly ny: number;
    };

/** Primer instante t ≥ 0 en que |p + v·t| = r, si se están acercando. */
function timeToReach(px: number, py: number, vx: number, vy: number, r: number): number {
  const pv = px * vx + py * vy;
  if (pv >= 0) return Infinity;
  const c = px * px + py * py - r * r;
  if (c <= 0) return 0;
  const a = vx * vx + vy * vy;
  const disc = pv * pv - a * c;
  if (disc < 0) return Infinity;
  return c / (-pv + Math.sqrt(disc));
}

function findHit(w: World, limit: number): Hit | null {
  const R = w.table.ballRadius;
  const balls = w.balls;
  let best: Hit | null = null;
  let bestT = limit;
  for (let i = 0; i < balls.length; i++) {
    const A = balls[i]!;
    if (!A.onTable) continue;
    const movingA = A.vx !== 0 || A.vy !== 0;
    for (let j = i + 1; j < balls.length; j++) {
      const B = balls[j]!;
      if (!B.onTable) continue;
      if (!movingA && B.vx === 0 && B.vy === 0) continue;
      const t = timeToReach(B.x - A.x, B.y - A.y, B.vx - A.vx, B.vy - A.vy, 2 * R);
      if (t < bestT) {
        best = { t, kind: "ball", i, j };
        bestT = t;
      }
    }
    if (!movingA) continue;
    for (const s of w.table.cushions) {
      const ex = s.b.x - s.a.x;
      const ey = s.b.y - s.a.y;
      const len = Math.sqrt(ex * ex + ey * ey);
      let nx = -ey / len;
      let ny = ex / len;
      let d = (A.x - s.a.x) * nx + (A.y - s.a.y) * ny;
      if (d < 0) {
        nx = -nx;
        ny = -ny;
        d = -d;
      }
      const vn = A.vx * nx + A.vy * ny;
      if (vn < 0) {
        const t = d <= R ? 0 : (d - R) / -vn;
        if (t < bestT) {
          const cx = A.x + A.vx * t - s.a.x;
          const cy = A.y + A.vy * t - s.a.y;
          const along = (cx * ex + cy * ey) / len;
          if (along >= 0 && along <= len) {
            best = { t, kind: "wall", i, nx, ny };
            bestT = t;
          }
        }
      }
      for (const q of [s.a, s.b]) {
        const px = A.x - q.x;
        const py = A.y - q.y;
        const t = timeToReach(px, py, A.vx, A.vy, R);
        if (t < bestT) {
          const hx = px + A.vx * t;
          const hy = py + A.vy * t;
          const hl = Math.sqrt(hx * hx + hy * hy);
          best = { t, kind: "wall", i, nx: hx / hl, ny: hy / hl };
          bestT = t;
        }
      }
    }
  }
  return best;
}

function collideBalls(w: World, A: Ball, B: Ball): void {
  const R = w.table.ballRadius;
  const { ballRestitution: e, ballFriction: mu } = w.table.cloth;
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const dl = Math.sqrt(dx * dx + dy * dy);
  const nx = dx / dl;
  const ny = dy / dl;
  const vn = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
  if (vn >= 0) return;
  const jn = (-(1 + e) * vn) / 2;
  A.vx -= jn * nx;
  A.vy -= jn * ny;
  B.vx += jn * nx;
  B.vy += jn * ny;
  // "Throw": rozamiento en el punto de contacto, por velocidad y efecto.
  const tx = -ny;
  const ty = nx;
  const rel = (A.vx - B.vx) * tx + (A.vy - B.vy) * ty + R * (A.wz + B.wz);
  const stop = (rel < 0 ? -rel : rel) / 7;
  const jt = stop < mu * jn ? stop : mu * jn;
  const f = rel > 0 ? -jt : jt;
  A.vx += f * tx;
  A.vy += f * ty;
  B.vx -= f * tx;
  B.vy -= f * ty;
  A.wz += (2.5 * f) / R;
  B.wz += (2.5 * f) / R;
  w.events.push({ kind: "ball", step: w.step, a: A.id, b: B.id, speed: -vn });
}

/** Distancia entre superficies por debajo de la cual dos bolas se tocan. */
const CONTACT_TOL = 0.001;
/** Duración de un contacto bola-bola real, en segundos. */
const CONTACT_TIME = 0.0002;
const MICRO_STEP = CONTACT_TIME / 50;
const MAX_MICRO_STEPS = 2000;

/**
 * Choque dentro de un grupo de bolas que se tocan (el triángulo en el saque).
 *
 * Resolver los choques uno por uno hace que la energía pase de bola en bola
 * como en un péndulo de Newton y el triángulo casi no se abre; resolverlos
 * todos a la vez como un bloque rígido lo lanza entero. Lo que pasa de verdad
 * está en medio: los contactos duran unos 0,2 ms y se solapan en el tiempo.
 * Por eso aquí el grupo se simula con resortes amortiguados (contacto blando)
 * en micro pasos hasta que todas las bolas se separan. Al final se conservan
 * las velocidades y se devuelven las posiciones: el choque cuenta como
 * instantáneo para el resto del paso. Devuelve false si no hay grupo.
 */
function collideCluster(w: World, i0: number, j0: number): boolean {
  const R = w.table.ballRadius;
  const e = w.table.cloth.ballRestitution;
  const all = w.balls;
  const reach = 2 * R + CONTACT_TOL;
  const reach2 = reach * reach;
  const inCluster = new Set<number>([i0, j0]);
  const queue = [i0, j0];
  while (queue.length) {
    const a = all[queue.shift()!]!;
    for (let k = 0; k < all.length; k++) {
      const b = all[k]!;
      if (!b.onTable || inCluster.has(k)) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (dx * dx + dy * dy <= reach2) {
        inCluster.add(k);
        queue.push(k);
      }
    }
  }
  if (inCluster.size <= 2) return false;
  const balls = [...inCluster].sort((x, y) => x - y).map((k) => all[k]!);
  const saved = balls.map((b) => ({ x: b.x, y: b.y }));
  // Resorte lineal con amortiguador: masa efectiva 1/2, rebote e.
  const omega = PI / CONTACT_TIME;
  const stiffness = 0.5 * omega * omega;
  const lnE = dln(e);
  const zeta = -lnE / Math.sqrt(PI * PI + lnE * lnE);
  const damping = 2 * 0.5 * zeta * omega;
  const D = 2 * R;
  const touched = new Set<string>();
  const firstSpeed = new Map<string, number>();
  for (let n = 0; n < MAX_MICRO_STEPS; n++) {
    let overlapping = false;
    for (let p = 0; p < balls.length; p++) {
      const a = balls[p]!;
      for (let q = p + 1; q < balls.length; q++) {
        const b = balls[q]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= D * D) continue;
        overlapping = true;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        const key = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
        if (!touched.has(key)) {
          touched.add(key);
          firstSpeed.set(key, vn < 0 ? -vn : 0);
        }
        const force = stiffness * (D - d) - damping * vn;
        if (force <= 0) continue;
        const j = force * MICRO_STEP;
        a.vx -= j * nx;
        a.vy -= j * ny;
        b.vx += j * nx;
        b.vy += j * ny;
      }
    }
    if (!overlapping && n > 0) break;
    for (const b of balls) {
      b.x += b.vx * MICRO_STEP;
      b.y += b.vy * MICRO_STEP;
    }
  }
  balls.forEach((b, k) => {
    b.x = saved[k]!.x;
    b.y = saved[k]!.y;
  });
  for (const key of [...touched].sort()) {
    const [a, b] = key.split("-").map(Number) as [number, number];
    w.events.push({ kind: "ball", step: w.step, a, b, speed: firstSpeed.get(key)! });
  }
  return true;
}

function collideWall(w: World, A: Ball, nx: number, ny: number): void {
  const R = w.table.ballRadius;
  const { cushionRestitution: e, cushionFriction: mu } = w.table.cloth;
  const vn = A.vx * nx + A.vy * ny;
  if (vn >= 0) return;
  const jn = -(1 + e) * vn;
  A.vx += jn * nx;
  A.vy += jn * ny;
  const tx = -ny;
  const ty = nx;
  const rel = A.vx * tx + A.vy * ty - R * A.wz;
  const stop = (rel < 0 ? -rel : rel) / 3.5;
  const jt = stop < mu * jn ? stop : mu * jn;
  const f = rel > 0 ? -jt : jt;
  A.vx += f * tx;
  A.vy += f * ty;
  A.wz -= (2.5 * f) / R;
  // La goma se come el giro de rodadura hacia ella.
  const kx = -ny;
  const ky = nx;
  const wk = A.wx * kx + A.wy * ky;
  A.wx -= wk * kx;
  A.wy -= wk * ky;
  w.events.push({ kind: "cushion", step: w.step, ball: A.id, speed: -vn });
}

function advance(w: World, t: number): void {
  if (t === 0) return;
  for (const b of w.balls) {
    if (!b.onTable) continue;
    b.x += b.vx * t;
    b.y += b.vy * t;
  }
}

function checkPockets(w: World): void {
  const { width: W, height: H, pockets } = w.table;
  for (const b of w.balls) {
    if (!b.onTable) continue;
    const outside = b.x < 0 || b.y < 0 || b.x > W || b.y > H;
    let bestP = -1;
    let bestD = Infinity;
    pockets.forEach((p, i) => {
      const dx = b.x - p.center.x;
      const dy = b.y - p.center.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        bestP = i;
      }
    });
    const inside = bestP >= 0 && bestD < pockets[bestP]!.radius * pockets[bestP]!.radius;
    if (outside || inside) {
      b.onTable = false;
      b.vx = b.vy = b.wx = b.wy = b.wz = 0;
      w.events.push({ kind: "pocket", step: w.step, ball: b.id, pocket: bestP });
    }
  }
}

const MAX_HITS_PER_STEP = 64;

/** Avanza el mundo un paso fijo. */
export function stepWorld(w: World): void {
  const { ballRadius: R, cloth } = w.table;
  for (const b of w.balls) if (isMoving(b)) applyCloth(b, R, cloth, STEP);
  let rem = STEP;
  for (let n = 0; n < MAX_HITS_PER_STEP; n++) {
    const hit = findHit(w, rem);
    if (!hit) break;
    advance(w, hit.t);
    rem -= hit.t;
    const A = w.balls[hit.i]!;
    if (hit.kind === "ball") {
      if (!collideCluster(w, hit.i, hit.j)) collideBalls(w, A, w.balls[hit.j]!);
    } else collideWall(w, A, hit.nx, hit.ny);
  }
  advance(w, rem);
  checkPockets(w);
  w.step++;
}

export interface ShotResult {
  readonly steps: number;
  readonly events: readonly SimEvent[];
}

/**
 * Simula hasta que todas las bolas paren. `onStep` recibe el mundo tras cada
 * paso (el cliente lo usa para grabar cuadros).
 */
export function runUntilRest(w: World, onStep?: (w: World) => void): ShotResult {
  const start = w.events.length;
  const first = w.step;
  while (!atRest(w)) {
    if (w.step - first >= MAX_STEPS) {
      for (const b of w.balls) b.vx = b.vy = b.wx = b.wy = b.wz = 0;
      break;
    }
    stepWorld(w);
    onStep?.(w);
  }
  return { steps: w.step - first, events: w.events.slice(start) };
}

/** Golpea y simula hasta el reposo. */
export function simulateShot(w: World, shot: Shot, onStep?: (w: World) => void): ShotResult {
  const start = w.events.length;
  const first = w.step;
  strike(w, shot);
  runUntilRest(w, onStep);
  return { steps: w.step - first, events: w.events.slice(start) };
}

/**
 * Huella del estado: FNV-1a sobre los bits de cada número. Si cambia un solo
 * bit de una posición, cambia la huella. La usan los tiros dorados y el
 * servidor para comparar con el cliente.
 */
export function worldHash(w: World): string {
  const buf = new DataView(new ArrayBuffer(8));
  let h = 0x811c9dc5;
  const mix = (byte: number) => {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  const num = (x: number) => {
    buf.setFloat64(0, x);
    for (let i = 0; i < 8; i++) mix(buf.getUint8(i));
  };
  for (const b of w.balls) {
    num(b.id);
    num(b.onTable ? 1 : 0);
    num(b.x);
    num(b.y);
  }
  num(w.step);
  return h.toString(16).padStart(8, "0");
}
