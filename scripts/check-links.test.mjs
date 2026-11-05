// Pruebas del revisor de enlaces: node --test "scripts/*.test.mjs"
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { anchorsOf, brokenLinks, linksOf, slugify } from "./check-links.mjs";

function repo(files) {
  const root = mkdtempSync(join(tmpdir(), "enlaces-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return { root, files: Object.keys(files) };
}

test("las anclas siguen las reglas de GitHub", () => {
  assert.equal(slugify("Inicio rápido"), "inicio-rápido");
  assert.equal(slugify("Accesibilidad, idiomas y SEO"), "accesibilidad-idiomas-y-seo");
  assert.equal(slugify("Usar `check-secrets.mjs`"), "usar-check-secretsmjs");
  assert.deepEqual([...anchorsOf("# A\n## A\n```\n# no\n```")], ["a", "a-1"]);
});

test("toma solo enlaces internos y salta el código", () => {
  const md = '[a](docs/A.md) [b](https://x.dev) <a href="#c">c</a> `[d](no.md)`\n```\n[e](no.md)\n```';
  assert.deepEqual(linksOf(md), ["docs/A.md", "#c"]);
});

test("encuentra archivos y secciones que no existen", () => {
  const { root, files } = repo({
    "README.md": "[ok](docs/A.md#uno) [mal](docs/B.md) [ancla](docs/A.md#dos) [propia](#titulo)\n# Título",
    "docs/A.md": "# Uno",
  });
  assert.deepEqual(brokenLinks(root, files), [
    "README.md: docs/B.md no existe",
    "README.md: docs/A.md#dos apunta a una sección que no existe",
    "README.md: #titulo apunta a una sección que no existe",
  ]);
});

test("lee .plantilla/ como si estuviera en la raíz", () => {
  const { root, files } = repo({
    ".plantilla/README.md": "[doc](docs/A.md) [propia](#inicio)\n# Inicio",
    "README.md": "# Plantilla",
    "SECURITY.md": "[inicio](README.md#inicio)",
    "docs/A.md": "# A",
  });
  assert.deepEqual(brokenLinks(root, files), []);
});
