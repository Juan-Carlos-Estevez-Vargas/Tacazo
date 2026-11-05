import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comoJugador, comoServidor, type Base } from "./db.js";
import { leerMigraciones, migrar } from "./migrar.js";
import {
  apelar,
  comoModeracion,
  descartar,
  reportar,
  resolverApelacion,
  restricciones,
  sancionar,
  trabajoNocturno,
  abrirRevision,
} from "./moderacion.js";
import { baseEnMemoria } from "./prueba-db.js";
import { partida } from "./prueba-partidas.js";
import { registrarPartida } from "./ranking.js";
import { UMBRALES_EJEMPLO } from "./senales.js";

let base: Base;

const nuevoJugador = (nombre: string) =>
  comoServidor(base, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      "INSERT INTO jugadores (nombre) VALUES ($1) RETURNING id",
      [nombre],
    );
    return rows[0]!.id;
  });

const guardar = (a: string, b: string, repeticion: unknown = { formato: 1 }) =>
  comoServidor(
    base,
    async (c) =>
      (
        await registrarPartida(c, {
          modo: "bola8",
          sala: "barrio",
          a,
          b,
          ganador: a,
          motivo: null,
          clasificatoria: true,
          motor: 2,
          repeticion,
        })
      ).id,
  );

const casoAbierto = (jugador: string) =>
  comoModeracion(base, async (c) => {
    const { rows } = await c.query<{ id: string; origen: string; senales: { clave: string }[] }>(
      "SELECT id, origen, senales FROM revisiones WHERE jugador = $1 AND estado = 'pendiente'",
      [jugador],
    );
    return rows[0] ?? null;
  });

beforeAll(async () => {
  base = await baseEnMemoria();
  await migrar(base, await leerMigraciones());
}, 30_000);

afterAll(() => base.cerrar());

describe("reportes", () => {
  it("solo se reportan partidas propias, una vez por partida", async () => {
    const [a, b, c] = [await nuevoJugador("Ana"), await nuevoJugador("Beto"), await nuevoJugador("Caro")];
    const p = await guardar(a, b);
    await comoJugador(base, a, (x) => reportar(x, a, { partida: p, reportado: b, motivo: "trampa" }));
    await expect(
      comoJugador(base, a, (x) => reportar(x, a, { partida: p, reportado: b, motivo: "nombre" })),
    ).rejects.toThrow(/Ya reportaste/);
    // Caro no jugó esa partida.
    await expect(
      comoJugador(base, c, (x) => reportar(x, c, { partida: p, reportado: b, motivo: "trampa" })),
    ).rejects.toThrow(/row-level security/);
    // Nadie se hace pasar por otro autor.
    await expect(
      comoJugador(base, c, (x) => reportar(x, b, { partida: p, reportado: a, motivo: "trampa" })),
    ).rejects.toThrow(/row-level security/);
    // Y nadie lee reportes ajenos.
    const ajenos = await comoJugador(
      base,
      b,
      async (x) => (await x.query("SELECT * FROM reportes")).rows.length,
    );
    expect(ajenos).toBe(0);
  });

  it("tres autores distintos que reportan trampa abren un caso", async () => {
    const sospechoso = await nuevoJugador("Sosp");
    for (const n of ["R1", "R2", "R3"]) {
      const autor = await nuevoJugador(n);
      const p = await guardar(sospechoso, autor);
      await comoJugador(base, autor, (x) =>
        reportar(x, autor, { partida: p, reportado: sospechoso, motivo: "trampa" }),
      );
    }
    await comoModeracion(base, (c) => trabajoNocturno(c, UMBRALES_EJEMPLO));
    expect((await casoAbierto(sospechoso))?.origen).toBe("reportes");
  });
});

describe("sanciones", () => {
  it("escalan con cada caso y restringen según el nivel", async () => {
    const j = await nuevoJugador("Esc");
    const niveles: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await comoModeracion(base, (c) => abrirRevision(c, j, "senales", [], 2, []));
      niveles.push((await comoModeracion(base, (c) => sancionar(c, r, "mod", "Puntería imposible"))).nivel);
      if (i === 1)
        expect(await comoServidor(base, (c) => restricciones(c, j))).toMatchObject({
          juega: true,
          clasifica: false,
        });
    }
    expect(niveles).toEqual([1, 2, 3, 4, 4]);
    expect(await comoServidor(base, (c) => restricciones(c, j))).toEqual({
      juega: false,
      clasifica: false,
      hasta: null,
    });
  });

  it("un caso descartado no sanciona ni se resuelve dos veces", async () => {
    const j = await nuevoJugador("Limpio");
    const r = await comoModeracion(base, (c) => abrirRevision(c, j, "senales", [], 2, []));
    await comoModeracion(base, (c) => descartar(c, r, "mod", "Era buena racha"));
    await expect(comoModeracion(base, (c) => sancionar(c, r, "mod", "x"))).rejects.toThrow(/ya se resolvió/);
    expect(await comoServidor(base, (c) => restricciones(c, j))).toMatchObject({
      juega: true,
      clasifica: true,
    });
  });

  it("se apela una vez; si se acepta, la sanción deja de contar", async () => {
    const j = await nuevoJugador("Apela");
    const otro = await nuevoJugador("Otro");
    const r1 = await comoModeracion(base, (c) => abrirRevision(c, j, "senales", [], 2, []));
    await comoModeracion(base, (c) => sancionar(c, r1, "mod", "Aviso"));
    const r2 = await comoModeracion(base, (c) => abrirRevision(c, j, "senales", [], 2, []));
    const { id } = await comoModeracion(base, (c) => sancionar(c, r2, "mod", "Tiempos de máquina"));
    expect(await comoServidor(base, (c) => restricciones(c, j))).toMatchObject({ clasifica: false });

    await expect(
      comoJugador(base, otro, (c) => apelar(c, id, "No fui yo, lo juro por mi taco")),
    ).rejects.toThrow(/no se puede apelar/);
    await expect(comoJugador(base, j, (c) => apelar(c, id, "corto"))).rejects.toThrow(/mínimo/);
    await comoJugador(base, j, (c) => apelar(c, id, "Juego con mouse de precisión, miren la repetición"));
    await expect(
      comoJugador(base, j, (c) => apelar(c, id, "Otra vez, por si acaso no la vieron")),
    ).rejects.toThrow(/no se puede apelar/);
    // El jugador no se levanta la sanción solo.
    await expect(
      comoJugador(base, j, (c) => c.query("UPDATE sanciones SET levantada = true WHERE id = $1", [id])),
    ).rejects.toThrow(/permission denied/);

    await comoModeracion(base, (c) => resolverApelacion(c, id, true));
    expect(await comoServidor(base, (c) => restricciones(c, j))).toMatchObject({
      juega: true,
      clasifica: true,
    });
  });
});

describe("trabajo nocturno", () => {
  it("abre caso a un bot perfecto con tiempos de máquina y no a un humano", async () => {
    const bot = await nuevoJugador("Robo");
    const humano = await nuevoJugador("Humano");
    const u = { ...UMBRALES_EJEMPLO, minTiempos: 10, minTiros: 10, errorMedianoGrados: 0.2 };
    for (let k = 0; k < 4; k++) {
      const rep = partida(300 + k, ["dificil", "facil"], (j, i, anim) =>
        j === 0 ? anim + 800 : anim + 3000 + ((i * 7919) % 9000),
      );
      await guardar(bot, humano, rep);
    }
    const r = await comoModeracion(base, (c) => trabajoNocturno(c, u));
    expect(r.revisados).toBeGreaterThanOrEqual(2);
    const caso = await casoAbierto(bot);
    expect(caso?.origen).toBe("senales");
    expect(caso?.senales.map((s) => s.clave)).toEqual(expect.arrayContaining(["tiempo"]));
    expect(await casoAbierto(humano)).toBeNull();
    // Correrlo otra vez no duplica el caso.
    await comoModeracion(base, (c) => trabajoNocturno(c, u));
    const n = await comoModeracion(
      base,
      async (c) => (await c.query("SELECT id FROM revisiones WHERE jugador = $1", [bot])).rows.length,
    );
    expect(n).toBe(1);
  }, 60_000);
});
