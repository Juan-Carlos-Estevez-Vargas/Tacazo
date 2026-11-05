/**
 * Tiros dorados: 50 tiros de referencia con su resultado exacto. Si un cambio
 * mueve un solo bit de una posición final, esta prueba falla. Eso es a
 * propósito: cliente, servidor y repeticiones dependen de que el motor sea
 * idéntico. Si el cambio de física es intencional:
 *
 *   1. Sube ENGINE_VERSION en packages/core/src/index.ts.
 *   2. Regenera: UPDATE_GOLDEN=1 pnpm test:golden
 *   3. Revisa el diff de tiros-dorados.json y explícalo en el PR.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ENGINE_VERSION,
  POOL_9FT,
  createRng,
  createWorld,
  rack8,
  simulateShot,
  worldHash,
  type BallInit,
  type Shot,
} from "../src/index.js";

interface GoldenShot {
  readonly name: string;
  readonly table: string;
  readonly balls: readonly BallInit[];
  readonly shot: Shot;
  readonly expect: { readonly hash: string; readonly steps: number; readonly pocketed: readonly number[] };
}

interface GoldenFile {
  readonly engineVersion: number;
  readonly shots: readonly GoldenShot[];
}

const FILE = new URL("./tiros-dorados.json", import.meta.url);
const TABLES = { [POOL_9FT.id]: POOL_9FT };

function run(g: Pick<GoldenShot, "table" | "balls" | "shot">): GoldenShot["expect"] {
  const table = TABLES[g.table];
  if (!table) throw new Error(`Mesa desconocida: ${g.table}`);
  const w = createWorld(table, g.balls);
  const r = simulateShot(w, g.shot);
  const pocketed = r.events.flatMap((e) => (e.kind === "pocket" ? [e.ball] : []));
  return { hash: worldHash(w), steps: r.steps, pocketed };
}

/** Genera las entradas: 10 saques y 40 tiros en posiciones al azar (con semilla fija). */
function generate(): Omit<GoldenShot, "expect">[] {
  const T = POOL_9FT;
  const R = T.ballRadius;
  const rng = createRng(2026);
  const r = (a: number, b: number) => a + rng.next() * (b - a);
  const round = (x: number) => Math.round(x * 1e6) / 1e6;
  const out: Omit<GoldenShot, "expect">[] = [];
  for (let i = 1; i <= 10; i++) {
    out.push({
      name: `saque-${i}`,
      table: T.id,
      balls: rack8(T, createRng(i)).map((b) => (b.id === 0 ? { ...b, y: round(r(0.4, 0.87)) } : b)),
      shot: {
        angle: 0,
        power: round(r(0.7, 1)),
        side: round(r(-0.2, 0.2)),
        top: round(r(-0.2, 0.2)),
        elevation: 0,
      },
    });
    const last = out[out.length - 1]!;
    const cue = last.balls[0]!;
    const apex = last.balls[1]!;
    out[out.length - 1] = {
      ...last,
      shot: { ...last.shot, angle: Math.atan2(apex.y - cue.y, apex.x - cue.x) },
    };
  }
  for (let i = 1; i <= 40; i++) {
    const n = 2 + Math.floor(rng.next() * 10);
    const balls: BallInit[] = [];
    while (balls.length < n) {
      const x = round(r(R + 0.005, T.width - R - 0.005));
      const y = round(r(R + 0.005, T.height - R - 0.005));
      if (balls.every((b) => (b.x - x) ** 2 + (b.y - y) ** 2 > (2 * R + 0.001) ** 2))
        balls.push({ id: balls.length, x, y });
    }
    const side = round(r(-0.65, 0.65));
    const top = round(r(-0.7, 0.7));
    out.push({
      name: `tiro-${i}`,
      table: T.id,
      balls,
      shot: {
        angle: round(r(-3.14, 3.14)),
        power: round(r(0.05, 1)),
        side,
        top,
        elevation: i % 5 === 0 ? round(r(10, 65)) : 0,
      },
    });
  }
  return out;
}

describe("tiros dorados", () => {
  if (process.env.UPDATE_GOLDEN) {
    it("regenera el archivo", () => {
      const data: GoldenFile = {
        engineVersion: ENGINE_VERSION,
        shots: generate().map((g) => ({ ...g, expect: run(g) })),
      };
      // Un tiro por línea: el diff de un cambio de física se lee tiro por tiro.
      const lines = data.shots.map((s) => "  " + JSON.stringify(s)).join(",\n");
      writeFileSync(FILE, `{\n "engineVersion": ${data.engineVersion},\n "shots": [\n${lines}\n ]\n}\n`);
    });
    return;
  }

  const data = JSON.parse(readFileSync(FILE, "utf8")) as GoldenFile;

  it("son de esta versión del motor", () => {
    expect(data.engineVersion, "Cambió ENGINE_VERSION: regenera los tiros dorados").toBe(ENGINE_VERSION);
    expect(data.shots).toHaveLength(50);
  });

  it.each(data.shots.map((s) => [s.name, s] as const))("%s da exactamente el mismo resultado", (_, g) => {
    expect(run(g)).toEqual(g.expect);
  });
});
