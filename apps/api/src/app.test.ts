import { randomBytes } from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from "jose";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearApi } from "./app.js";
import { firmarInvitado, leerInvitado, limpiarNombre, turnstile, verificadorNeon } from "./cuentas.js";
import { comoServidor, type Base } from "./db.js";
import { leerMigraciones, migrar } from "./migrar.js";
import { baseEnMemoria } from "./prueba-db.js";
import { registrarPartida } from "./ranking.js";

const AUTH = "https://ep-prueba.aws.neon.tech/neondb/auth";
const ORIGEN = new URL(AUTH).origin;
// Clave al azar en cada corrida: ninguna clave queda escrita en el repo.
const SECRETO = randomBytes(24).toString("hex");

let base: Base;
let app: FastifyInstance;
let firmar: (sub: string, extra?: Record<string, unknown>, vence?: string | number) => Promise<string>;

beforeAll(async () => {
  base = await baseEnMemoria();
  await migrar(base, await leerMigraciones());
  const { publicKey, privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519" });
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "EdDSA" };
  firmar = (sub, extra = {}, vence = "15m") =>
    new SignJWT({ name: "Juan", emailVerified: true, ...extra })
      .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
      .setSubject(sub)
      .setIssuer(ORIGEN)
      .setAudience(ORIGEN)
      .setIssuedAt()
      .setExpirationTime(vence)
      .sign(privateKey);
  app = await crearApi({
    base,
    secreto: SECRETO,
    verificarCuenta: verificadorNeon(AUTH, createLocalJWKSet({ keys: [jwk] })),
    verificarHumano: async (t) => t === "ok",
    origenes: ["http://localhost:5173"],
    limite: 1000,
  });
}, 30_000);

afterAll(async () => {
  await app.close();
  await base.cerrar();
});

const pedir = (method: "GET" | "POST" | "PATCH", url: string, token?: string, payload?: unknown) =>
  app.inject({
    method,
    url,
    ...(payload === undefined ? {} : { payload: payload as object }),
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

const invitado = async (nombre = "Ana", pais: string | null = "CO") => {
  const r = await pedir("POST", "/invitados", undefined, { nombre, pais, turnstile: "ok" });
  expect(r.statusCode).toBe(201);
  return r.json() as { jugador: string; token: string };
};

describe("token de invitado", () => {
  it("se verifica y no se puede alterar ni usar vencido", () => {
    const j = "860dc360-609f-4b7d-9e70-ec93fe6414d3";
    const t = firmarInvitado(j, 2000, SECRETO);
    expect(leerInvitado(t, SECRETO, 1000)).toBe(j);
    expect(leerInvitado(t, SECRETO, 3000)).toBeNull();
    expect(leerInvitado(t, "otro", 1000)).toBeNull();
    expect(leerInvitado(t.replace(j, "860dc360-609f-4b7d-9e70-ec93fe6414d4"), SECRETO, 1000)).toBeNull();
    expect(leerInvitado("inv.x.y", SECRETO, 0)).toBeNull();
  });

  it("limpia nombres", () => {
    expect(limpiarNombre("  Juan\u0000  Carlos​ ")).toBe("Juan Carlos");
    expect(limpiarNombre("\u0007")).toBe("Invitado");
    expect([...limpiarNombre("🎱".repeat(30))]).toHaveLength(20);
  });
});

describe("invitados y cuentas", () => {
  it("crea un invitado solo si Turnstile lo aprueba", async () => {
    const malo = await pedir("POST", "/invitados", undefined, { nombre: "Bot", turnstile: "no" });
    expect(malo.statusCode).toBe(403);
    const raro = await pedir("POST", "/invitados", undefined, { nombre: "X", extra: 1 });
    expect(raro.statusCode).toBe(400);
    const { token } = await invitado("Ana");
    const yo = await pedir("GET", "/yo", token);
    expect(yo.json()).toMatchObject({ nombre: "Ana", pais: "CO", invitado: true });
  });

  it("pasar a cuenta conserva el mismo jugador y su progreso", async () => {
    const yo = await invitado("Bea");
    const rival = await invitado("Rival");
    await comoServidor(base, (c) =>
      registrarPartida(c, {
        modo: "bola8",
        sala: "barrio",
        a: yo.jugador,
        b: rival.jugador,
        ganador: yo.jugador,
        motivo: null,
        clasificatoria: true,
        motor: 2,
        repeticion: {},
      }),
    );
    const jwt = await firmar("cuenta-bea");
    // Antes de vincular, la cuenta sola no sirve.
    expect((await pedir("GET", "/yo", jwt)).json()).toMatchObject({ error: "sin_vincular" });

    const v = await pedir("POST", "/cuenta/vincular", yo.token, { jwt });
    expect(v.json()).toEqual({ jugador: yo.jugador, nuevo: true });
    const perfil = (await pedir("GET", "/yo", jwt)).json();
    expect(perfil).toMatchObject({ id: yo.jugador, invitado: false });
    expect(perfil.ratings[0]).toMatchObject({ modo: "bola8", partidas: 1 });

    // En otro aparato: un invitado nuevo inicia sesión y recupera su jugador.
    const otro = await invitado("Bea2");
    const v2 = await pedir("POST", "/cuenta/vincular", otro.token, { jwt });
    expect(v2.json()).toEqual({ jugador: yo.jugador, nuevo: false });
    // Y el invitado ya vinculado no se puede ligar a otra cuenta.
    const v3 = await pedir("POST", "/cuenta/vincular", yo.token, { jwt: await firmar("otra-cuenta") });
    expect(v3.statusCode).toBe(409);
  });

  it("rechaza JWT falsos, vencidos o de cuentas bloqueadas", async () => {
    const { token } = await invitado("Caro");
    const { privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519" });
    const falso = await new SignJWT({})
      .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
      .setSubject("x")
      .setIssuer(ORIGEN)
      .setAudience(ORIGEN)
      .setExpirationTime("15m")
      .sign(privateKey);
    expect((await pedir("POST", "/cuenta/vincular", token, { jwt: falso })).statusCode).toBe(401);
    const viejo = await firmar("vieja", {}, Math.floor(Date.now() / 1000) - 60);
    expect((await pedir("POST", "/cuenta/vincular", token, { jwt: viejo })).statusCode).toBe(401);
    const bloqueada = await firmar("bloq", { banned: true });
    expect((await pedir("POST", "/cuenta/vincular", token, { jwt: bloqueada })).statusCode).toBe(409);
    expect((await pedir("GET", "/yo", "basura")).statusCode).toBe(401);
    expect((await pedir("GET", "/yo")).statusCode).toBe(401);
  });

  it("da un token corto para el servidor de partidas, también a cuentas", async () => {
    const yo = await invitado("Juego");
    const r = await pedir("POST", "/sesion-juego", yo.token);
    const { token, jugador } = r.json() as { token: string; jugador: string };
    expect(jugador).toBe(yo.jugador);
    expect(leerInvitado(token, SECRETO, Date.now())).toBe(yo.jugador);
    expect(leerInvitado(token, SECRETO, Date.now() + 3 * 3_600_000)).toBeNull();
    const jwt = await firmar("cuenta-juego");
    await pedir("POST", "/cuenta/vincular", yo.token, { jwt });
    expect((await pedir("POST", "/sesion-juego", jwt)).json()).toMatchObject({ jugador: yo.jugador });
    expect((await pedir("POST", "/sesion-juego")).statusCode).toBe(401);
  });

  it("solo edita su propio perfil, con datos válidos", async () => {
    const { token } = await invitado("Dani");
    const r = await pedir("PATCH", "/yo", token, { nombre: "  Dani  P ", pais: null, region: "eu" });
    expect(r.json()).toMatchObject({ nombre: "Dani P", pais: null, region: "eu" });
    expect((await pedir("PATCH", "/yo", token, { pais: "colombia" })).statusCode).toBe(400);
    expect((await pedir("PATCH", "/yo", token, { cuenta: "robada" })).statusCode).toBe(400);
  });
});

describe("ranking, reportes y apelaciones por HTTP", () => {
  it("sirve las tablas y valida el modo y el país", async () => {
    expect((await pedir("GET", "/ranking/bola8")).statusCode).toBe(200);
    expect((await pedir("GET", "/ranking/ajedrez")).statusCode).toBe(400);
    expect((await pedir("GET", "/ranking/bola8?alcance=pais&pais=co")).statusCode).toBe(400);
    expect((await pedir("GET", "/ranking/bola8?alcance=amigos")).statusCode).toBe(401);
    const { token } = await invitado("Eli");
    expect((await pedir("GET", "/ranking/bola8?alcance=amigos", token)).statusCode).toBe(200);
  });

  it("reporta una partida propia una sola vez", async () => {
    const a = await invitado("Fer");
    const b = await invitado("Gabi");
    const partida = await comoServidor(base, async (c) => {
      const r = await registrarPartida(c, {
        modo: "bola8",
        sala: "x",
        a: a.jugador,
        b: b.jugador,
        ganador: b.jugador,
        motivo: null,
        clasificatoria: false,
        motor: 2,
        repeticion: {},
      });
      return r.id;
    });
    const cuerpo = { partida, reportado: b.jugador, motivo: "trampa", detalle: "Mete todo" };
    expect((await pedir("POST", "/reportes", a.token, cuerpo)).statusCode).toBe(201);
    expect((await pedir("POST", "/reportes", a.token, cuerpo)).statusCode).toBe(409);
    const ajeno = await invitado("Hugo");
    expect((await pedir("POST", "/reportes", ajeno.token, cuerpo)).statusCode).toBe(403);
    expect((await pedir("GET", "/sanciones", a.token)).json()).toMatchObject({
      vigentes: { juega: true, clasifica: true },
      lista: [],
    });
  });

  it("Turnstile habla con Cloudflare y falla cerrado", async () => {
    const ok = turnstile("s", (async () => new Response(JSON.stringify({ success: true }))) as typeof fetch);
    const caido = turnstile("s", (async () => {
      throw new Error("red");
    }) as typeof fetch);
    expect(await ok("tok", "1.2.3.4")).toBe(true);
    expect(await caido("tok", "1.2.3.4")).toBe(false);
    expect(await ok("", "1.2.3.4")).toBe(false);
  });

  it("limita las peticiones por IP", async () => {
    const chica = await crearApi({
      base,
      secreto: SECRETO,
      verificarCuenta: async () => null,
      verificarHumano: null,
      origenes: [],
      limite: 3,
    });
    const codigos = [];
    for (let i = 0; i < 5; i++)
      codigos.push((await chica.inject({ method: "GET", url: "/salud" })).statusCode);
    expect(codigos).toEqual([200, 200, 200, 429, 429]);
    await chica.close();
  });
});

describe("monedas y tienda por HTTP", () => {
  it("da bienvenida, premio diario una vez y muestra las salas", async () => {
    const { token } = await invitado("Nico");
    const m = (await pedir("GET", "/monedas", token)).json();
    expect(m).toMatchObject({ saldo: 500, diario: { monto: 100, disponible: true } });
    expect(m.salas.map((s: { id: string }) => s.id)).toEqual(["barrio", "club", "campeonato"]);
    expect((await pedir("POST", "/monedas/diario", token)).json()).toEqual({ monto: 100, saldo: 600 });
    const otra = await pedir("POST", "/monedas/diario", token);
    expect(otra.statusCode).toBe(409);
    expect((await pedir("GET", "/monedas", token)).json()).toMatchObject({
      saldo: 600,
      diario: { disponible: false },
    });
    expect((await pedir("GET", "/monedas")).statusCode).toBe(401);
  });

  it("compra, equipa solo lo propio y avisa si no alcanza", async () => {
    const { token } = await invitado("Olga");
    const pobre = await pedir("POST", "/tienda/taco_laton", token);
    expect(pobre.statusCode).toBe(409);
    expect(pobre.json()).toMatchObject({ error: "saldo" });
    await pedir("POST", "/monedas/diario", token);
    expect((await pedir("POST", "/tienda/taco_laton", token)).json()).toEqual({
      resultado: "nuevo",
      saldo: 0,
    });
    expect((await pedir("POST", "/tienda/taco_laton", token)).json()).toEqual({ resultado: "ya", saldo: 0 });
    expect((await pedir("POST", "/tienda/marco_bronce", token)).statusCode).toBe(409);
    expect((await pedir("POST", "/tienda/no_existe", token)).statusCode).toBe(409);
    expect((await pedir("POST", "/tienda/..%2Fx", token)).statusCode).toBe(400);

    const tienda = (await pedir("GET", "/tienda", token)).json();
    expect(tienda).toMatchObject({ saldo: 0, partidas: 0, equipado: {} });
    expect(tienda.tiene).toEqual(expect.arrayContaining(["taco_roble", "taco_laton", "pano_verde"]));

    expect((await pedir("PATCH", "/yo/equipado", token, { taco: "taco_laton" })).json()).toEqual({
      equipado: { taco: "taco_laton" },
    });
    expect((await pedir("PATCH", "/yo/equipado", token, { pano: "pano_azul" })).statusCode).toBe(409);
    expect((await pedir("PATCH", "/yo/equipado", token, { marco: "taco_laton" })).statusCode).toBe(409);
    expect((await pedir("PATCH", "/yo/equipado", token, { sombrero: "x" })).statusCode).toBe(400);
    expect((await pedir("GET", "/yo", token)).json()).toMatchObject({ equipado: { taco: "taco_laton" } });
  });
});
