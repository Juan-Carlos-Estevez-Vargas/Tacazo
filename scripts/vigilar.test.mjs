// Pruebas de la vigilancia: node --test "scripts/*.test.mjs"
import assert from "node:assert/strict";
import { test } from "node:test";
import { vigilar } from "./vigilar.mjs";

const respuesta = (estado, cuerpo) => new Response(JSON.stringify(cuerpo), { status: estado });

test("sin URLs no vigila nada", async () => {
  const f = async () => assert.fail("no debía pedir nada");
  assert.deepEqual(await vigilar({}, f, () => {}), []);
});

test("todo en orden no avisa", async () => {
  const pedidos = [];
  const f = async (url) => (pedidos.push(String(url)), respuesta(200, { ok: true }));
  const env = { TACAZO_URL_API: "https://api.x", TACAZO_URL_PARTIDAS: "https://p.x", TACAZO_ALERTAS_WEBHOOK: "https://w.x" };
  assert.deepEqual(await vigilar(env, f, () => {}), []);
  assert.deepEqual(pedidos.sort(), ["https://api.x/salud", "https://p.x/salud"]);
});

test("un servicio caído o con la base rota avisa al webhook", async () => {
  const avisos = [];
  const f = async (url, init) => {
    const host = new URL(url).host;
    if (host === "w.x") return (avisos.push(JSON.parse(init.body).content), respuesta(204, {}));
    if (host === "api.x") return respuesta(503, { ok: false, base: false });
    throw new Error("ECONNREFUSED");
  };
  const env = { TACAZO_URL_API: "https://api.x", TACAZO_URL_PARTIDAS: "https://p.x", TACAZO_ALERTAS_WEBHOOK: "https://w.x" };
  const fallos = await vigilar(env, f, () => {});
  assert.deepEqual(fallos, ["API: respondió 503", "Partidas: no responde (ECONNREFUSED)"]);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /API: respondió 503/);
});
