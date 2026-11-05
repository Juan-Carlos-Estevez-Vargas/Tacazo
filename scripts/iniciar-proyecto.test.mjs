// Pruebas del script que inicia un proyecto: node --test "scripts/*.test.mjs"
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { iniciar, parseArgs, replacePlaceholders, repoFromRemote } from "./iniciar-proyecto.mjs";

function repo(files) {
  const root = mkdtempSync(join(tmpdir(), "iniciar-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return { root, files: Object.keys(files) };
}

const plantilla = () =>
  repo({
    "README.md": "# Plantilla de proyectos",
    ".plantilla/README.md":
      "# NOMBRE DEL PROYECTO\n\n**Una frase que diga qué es y para quién.**\n\n" +
      "https://github.com/x/NOMBRE-DEL-REPO\n\n- [ ] Reemplazar `NOMBRE-DEL-REPO` y `NOMBRE DEL PROYECTO` en todos los archivos\n",
    "SECURITY.md": "https://github.com/x/NOMBRE-DEL-REPO/security",
    "CHANGELOG.md": "# Cambios de la plantilla",
    "extras/i18n/README.md": "base de idiomas",
    "docs/IDIOMAS.md": "Base en [`extras/i18n/`](../extras/i18n/).",
    "scripts/iniciar-proyecto.mjs": "// NOMBRE-DEL-REPO",
    "scripts/iniciar-proyecto.test.mjs": "",
  });

test("reemplaza los marcadores y marca el primer paso como hecho", () => {
  const out = replacePlaceholders(
    "NOMBRE DEL PROYECTO · NOMBRE-DEL-REPO · Una frase que diga qué es y para quién.\n- [ ] Reemplazar `NOMBRE-DEL-REPO` y `NOMBRE DEL PROYECTO` en todos los archivos",
    { repo: "mi-app", nombre: "Mi App", descripcion: "Para mí." },
  );
  assert.equal(out, "Mi App · mi-app · Para mí.\n- [x] Reemplazar `mi-app` y `Mi App` en todos los archivos");
});

test("lee las opciones y rechaza las desconocidas", () => {
  assert.deepEqual(parseArgs(["--repo", "a", "--sin-extras"]), { repo: "a", "sin-extras": true });
  assert.throws(() => parseArgs(["--nombre"]), /Falta el valor/);
  assert.throws(() => parseArgs(["--color", "rojo"]), /desconocida/);
});

test("saca el nombre del repo del remoto", () => {
  assert.equal(repoFromRemote("https://github.com/x/mi-app.git\n"), "mi-app");
  assert.equal(repoFromRemote("git@github.com:x/mi_app.git"), "mi_app");
});

test("deja el proyecto listo y se borra a sí mismo", () => {
  const { root, files } = plantilla();
  iniciar(root, { repo: "mi-app", nombre: "Mi App", sinExtras: true }, files);
  const readme = readFileSync(join(root, "README.md"), "utf8");
  assert.match(readme, /^# Mi App/);
  assert.match(readme, /github\.com\/x\/mi-app/);
  assert.match(readme, /- \[x\] Reemplazar/);
  assert.equal(readFileSync(join(root, "SECURITY.md"), "utf8"), "https://github.com/x/mi-app/security");
  assert.match(readFileSync(join(root, "CHANGELOG.md"), "utf8"), /Juan-Carlos-Estevez-Vargas\/mi-app\/releases/);
  assert.equal(
    readFileSync(join(root, "docs/IDIOMAS.md"), "utf8"),
    "Base en [`extras/i18n/`](https://github.com/Juan-Carlos-Estevez-Vargas/plantilla-proyectos/tree/main/extras/i18n/).",
  );
  for (const gone of [".plantilla", "extras", "scripts/iniciar-proyecto.mjs", "scripts/iniciar-proyecto.test.mjs"]) {
    assert.equal(existsSync(join(root, gone)), false, gone);
  }
});

test("en simulación no toca nada", () => {
  const { root, files } = plantilla();
  const log = iniciar(root, { repo: "mi-app", nombre: "Mi App", simular: true }, files);
  assert.ok(log.length > 0);
  assert.equal(readFileSync(join(root, "README.md"), "utf8"), "# Plantilla de proyectos");
  assert.equal(existsSync(join(root, ".plantilla/README.md")), true);
});

test("no corre dos veces ni con nombres raros", () => {
  const { root, files } = plantilla();
  assert.throws(() => iniciar(root, { repo: "mi app; rm", nombre: "x" }, files), /no válido/);
  iniciar(root, { repo: "mi-app", nombre: "Mi App" }, files);
  assert.throws(() => iniciar(root, { repo: "mi-app", nombre: "Mi App" }, files), /ya se inició/);
});
