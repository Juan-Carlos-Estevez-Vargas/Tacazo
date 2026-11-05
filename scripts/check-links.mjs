/**
 * Revisa los enlaces internos de la documentación: que cada archivo enlazado
 * exista y que cada ancla (#sección) apunte a un título real.
 *
 *   node scripts/check-links.mjs
 *
 * Mira todos los .md versionados. Los enlaces externos (http, mailto) no se
 * revisan: dependen de la red y de terceros. Termina con código 1 si algo
 * está roto, para que CI avise cuando un README o un diagrama quedó viejo.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

/** Carpeta de la plantilla con archivos que pasan a la raíz al iniciar. */
const STAGED = ".plantilla";

/** Ancla que GitHub genera para un título. */
export function slugify(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/ /g, "-");
}

/** Quita los bloques de código para no leer enlaces de ejemplo. */
function stripCode(text) {
  return text.replace(/^(```|~~~)[\s\S]*?^\1/gm, "").replace(/`[^`\n]*`/g, "");
}

/** Anclas de un archivo Markdown (con -1, -2… si un título se repite). */
export function anchorsOf(markdown) {
  const seen = new Map();
  const anchors = new Set();
  for (const match of stripCode(markdown).matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = slugify(match[1]);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    anchors.add(n === 0 ? base : `${base}-${n}`);
  }
  for (const match of markdown.matchAll(/<a\s+(?:name|id)="([^"]+)"/g)) anchors.add(match[1]);
  return anchors;
}

/** Enlaces internos de un texto Markdown: `[x](destino)` y `href="destino"`. */
export function linksOf(markdown) {
  const links = [];
  const text = stripCode(markdown);
  for (const match of text.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) links.push(match[1]);
  for (const match of text.matchAll(/\b(?:href|src)="([^"]+)"/g)) links.push(match[1]);
  return links.filter((link) => !/^[a-z][a-z0-9+.-]*:/i.test(link));
}

/**
 * Enlaces rotos de los archivos indicados.
 * @param {string} root
 * @param {string[]} files rutas relativas a root
 * @returns {string[]}
 */
export function brokenLinks(root, files) {
  const cache = new Map();
  const anchors = (path) => {
    if (!cache.has(path)) cache.set(path, anchorsOf(readFileSync(path, "utf8")));
    return cache.get(path);
  };
  const report = [];
  for (const file of files.filter((f) => f.endsWith(".md"))) {
    const full = join(root, file);
    // En la plantilla, .plantilla/ guarda archivos que al iniciar pasan a la
    // raíz: sus enlaces se leen como si ya estuvieran allí, y un enlace a la
    // raíz usa la versión de .plantilla/ si existe (el README del proyecto).
    const here = file.startsWith(`${STAGED}/`) ? join(root, file.slice(STAGED.length + 1)) : full;
    for (const link of linksOf(readFileSync(full, "utf8"))) {
      const [rawPath, rawAnchor] = link.split("#");
      const path = decodeURIComponent(rawPath);
      let target = path ? normalize(join(dirname(here), path)) : full;
      const staged = join(root, STAGED, target.slice(root.length + 1));
      if (path && target.startsWith(`${root}/`) && existsSync(staged) && statSync(staged).isFile()) target = staged;
      if (!existsSync(target)) {
        report.push(`${file}: ${link} no existe`);
        continue;
      }
      if (rawAnchor && statSync(target).isFile() && target.endsWith(".md")) {
        if (!anchors(target).has(decodeURIComponent(rawAnchor).toLowerCase())) {
          report.push(`${file}: ${link} apunta a una sección que no existe`);
        }
      }
    }
  }
  return report;
}

function main() {
  const root = process.cwd();
  const files = execFileSync("git", ["ls-files", "-z", "*.md"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  const report = brokenLinks(root, files);
  if (report.length > 0) {
    console.error(`Hay ${report.length} enlaces rotos:\n  ${report.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`Enlaces internos en orden en ${files.length} archivos ✔`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}
