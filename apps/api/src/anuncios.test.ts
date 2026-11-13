import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  acreditarAnuncio,
  ANUNCIOS_POR_DIA,
  clavesAdmob,
  PREMIO_ANUNCIO,
  verificarAdmob,
  VERIFICADOR_ADMOB,
} from "./anuncios.js";
import { crearApi } from "./app.js";
import { firmarInvitado } from "./cuentas.js";
import { comoServidor, type Base } from "./db.js";
import { leerMigraciones, migrar } from "./migrar.js";
import { comoMonedas, darBienvenida, mover, saldo } from "./monedas.js";
import { baseEnMemoria } from "./prueba-db.js";

// Claves de prueba generadas en cada corrida, en el formato que publica AdMob.
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
const ID_CLAVE = "3335741209";
const respuestaClaves = JSON.stringify({ keys: [{ keyId: Number(ID_CLAVE), pem, base64: "" }] });
let pedidasClaves = 0;
const fetchFalso = (async (url: string) => {
  expect(url).toBe(VERIFICADOR_ADMOB);
  pedidasClaves++;
  return new Response(respuestaClaves);
}) as unknown as typeof fetch;

let n = 0;
/** Consulta como la arma AdMob: parámetros en orden, firma y key_id al final. */
function consultaAdmob(
  jugador: string,
  transaccion = `tx${++n}`,
  clave = privateKey,
  keyId = ID_CLAVE,
): string {
  const firmado = new URLSearchParams({
    ad_network: "5450213213286189855",
    ad_unit: "1234567890",
    reward_amount: "1",
    reward_item: "monedas",
    timestamp: String(Date.now()),
    transaction_id: transaccion,
    user_id: jugador,
  }).toString();
  const firma = sign("sha256", Buffer.from(firmado), clave).toString("base64url");
  return `${firmado}&signature=${firma}&key_id=${keyId}`;
}

const SECRETO = randomBytes(24).toString("hex");
let base: Base;
let app: FastifyInstance;

beforeAll(async () => {
  base = await baseEnMemoria();
  await migrar(base, await leerMigraciones());
  app = await crearApi({
    base,
    secreto: SECRETO,
    verificarCuenta: async () => null,
    verificarHumano: null,
    origenes: [],
    limite: 1000,
    clavesAnuncio: clavesAdmob(fetchFalso),
  });
}, 30_000);

afterAll(async () => {
  await app.close();
  await base.cerrar();
});

/** Jugador con `monedas` de saldo (bienvenida menos un gasto). */
async function jugador(monedas: number): Promise<string> {
  const id = await comoServidor(base, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      "INSERT INTO jugadores (nombre) VALUES ('Ana') RETURNING id",
    );
    return rows[0]!.id;
  });
  await comoMonedas(base, async (c) => {
    await darBienvenida(c, id);
    const gasto = 500 - monedas;
    if (gasto > 0)
      await mover(c, {
        clave: `gasto:${id}`,
        tipo: "compra",
        asientos: [
          { jugador: id, monto: -gasto },
          { sistema: "tienda", monto: gasto },
        ],
      });
  });
  return id;
}

const saldoDe = (j: string) => comoMonedas(base, (c) => saldo(c, j));
const llamarAdmob = (consulta: string) => app.inject({ method: "GET", url: `/anuncios/admob?${consulta}` });

describe("firma de AdMob", () => {
  it("acepta solo consultas firmadas con una clave publicada", async () => {
    const claves = clavesAdmob(fetchFalso);
    const j = "860dc360-609f-4b7d-9e70-ec93fe6414d3";
    expect(await verificarAdmob(consultaAdmob(j, "abc"), claves)).toEqual({ transaccion: "abc", jugador: j });
    // Cambiar cualquier dato firmado rompe la firma.
    const q = consultaAdmob(j, "abc");
    expect(await verificarAdmob(q.replace("transaction_id=abc", "transaction_id=abd"), claves)).toBeNull();
    expect(await verificarAdmob(q.replace("reward_amount=1", "reward_amount=9"), claves)).toBeNull();
    const otra = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey;
    expect(await verificarAdmob(consultaAdmob(j, "x", otra), claves)).toBeNull();
    expect(await verificarAdmob(consultaAdmob(j, "x", privateKey, "999"), claves)).toBeNull();
    expect(await verificarAdmob(consultaAdmob("no-es-uuid"), claves)).toBeNull();
    expect(await verificarAdmob("user_id=x", claves)).toBeNull();
    expect(
      await verificarAdmob(`${q.split("&signature=")[0]}&signature=basura&key_id=${ID_CLAVE}`, claves),
    ).toBeNull();
  });

  it("guarda las claves y no las pide en cada llamada", async () => {
    let t = 0;
    const antes = pedidasClaves;
    const claves = clavesAdmob(fetchFalso, () => t);
    t = 100_000_000;
    await claves(ID_CLAVE);
    await claves(ID_CLAVE);
    expect(pedidasClaves - antes).toBe(1);
    // Un key_id desconocido vuelve a pedirlas, pero no más de una vez por minuto.
    await claves("otra");
    t += 61_000;
    await claves("otra");
    expect(pedidasClaves - antes).toBe(2);
    t += 86_400_001;
    await claves(ID_CLAVE);
    expect(pedidasClaves - antes).toBe(3);
  });

  it("si AdMob no responde, no acredita", async () => {
    const caido = clavesAdmob((async () => {
      throw new Error("red");
    }) as typeof fetch);
    expect(await verificarAdmob(consultaAdmob("860dc360-609f-4b7d-9e70-ec93fe6414d3"), caido)).toBeNull();
  });
});

describe("premio por anuncio", () => {
  it("acredita una vez por transacción a quien no alcanza la sala más barata", async () => {
    const j = await jugador(10);
    const q = consultaAdmob(j);
    const r = await llamarAdmob(q);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ resultado: "acreditado" });
    expect((await llamarAdmob(q)).json()).toEqual({ resultado: "repetido" });
    expect(await saldoDe(j)).toBe(10 + PREMIO_ANUNCIO);
  });

  it("no acredita a quien ya tiene para jugar", async () => {
    const j = await jugador(500);
    expect((await llamarAdmob(consultaAdmob(j))).json()).toEqual({ resultado: "con_saldo" });
    expect(await saldoDe(j)).toBe(500);
  });

  it("respeta el límite diario", async () => {
    const j = await jugador(0);
    // Gasta cada premio para seguir por debajo de la entrada mínima.
    for (let i = 0; i < ANUNCIOS_POR_DIA; i++) {
      expect(
        await comoMonedas(base, (c) =>
          acreditarAnuncio(c, { transaccion: `lim${i}`, jugador: j }, Date.now()),
        ),
      ).toBe("acreditado");
      await comoMonedas(base, (c) =>
        mover(c, {
          clave: `gasto-lim:${i}:${j}`,
          tipo: "compra",
          asientos: [
            { jugador: j, monto: -PREMIO_ANUNCIO },
            { sistema: "tienda", monto: PREMIO_ANUNCIO },
          ],
        }),
      );
    }
    expect(
      await comoMonedas(base, (c) => acreditarAnuncio(c, { transaccion: "lim-x", jugador: j }, Date.now())),
    ).toBe("limite");
  });

  it("rechaza firmas falsas y jugadores que no existen", async () => {
    const j = await jugador(0);
    const falsa = consultaAdmob(j).replace(/signature=[^&]+/, "signature=AAAA");
    expect((await llamarAdmob(falsa)).statusCode).toBe(403);
    expect((await llamarAdmob("")).statusCode).toBe(403);
    expect((await llamarAdmob(consultaAdmob("860dc360-609f-4b7d-9e70-ec93fe6414d9"))).json()).toEqual({
      resultado: "sin_jugador",
    });
    expect(await saldoDe(j)).toBe(0);
  });

  it("/monedas dice si se puede ver un anuncio", async () => {
    const pobre = await jugador(20);
    const rico = await jugador(500);
    const ver = async (j: string) =>
      (
        await app.inject({
          method: "GET",
          url: "/monedas",
          headers: { authorization: `Bearer ${firmarInvitado(j, Date.now() + 60_000, SECRETO)}` },
        })
      ).json().anuncio;
    expect(await ver(pobre)).toEqual({
      monto: PREMIO_ANUNCIO,
      restantes: ANUNCIOS_POR_DIA,
      disponible: true,
    });
    expect(await ver(rico)).toMatchObject({ disponible: false });
  });
});
