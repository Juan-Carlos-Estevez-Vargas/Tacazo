// Pruebas del medidor de peso: node --test "scripts/*.test.mjs"
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { LIMITE, pesoCliente } from "./check-peso.mjs";

test("suma todo dist, también lo que se carga después", () => {
  const dist = mkdtempSync(join(tmpdir(), "peso-"));
  mkdirSync(join(dist, "assets"));
  writeFileSync(join(dist, "index.html"), "<p>hola</p>");
  writeFileSync(join(dist, "assets/a.js"), "x".repeat(1000));
  writeFileSync(join(dist, ".tsbuildinfo"), "no cuenta");
  const r = pesoCliente(dist);
  assert.equal(r.archivos.length, 2);
  assert.equal(r.total, 1011);
  assert.equal(r.archivos[0].ruta, join("assets", "a.js"));
  assert.ok(r.pasa);
});

test("falla si pasa del límite", () => {
  const dist = mkdtempSync(join(tmpdir(), "peso-"));
  writeFileSync(join(dist, "grande.bin"), Buffer.alloc(LIMITE + 1));
  assert.equal(pesoCliente(dist).pasa, false);
});
