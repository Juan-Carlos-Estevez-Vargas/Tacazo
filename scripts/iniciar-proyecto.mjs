/**
 * Deja listo un repo recién creado desde la plantilla, en un solo paso.
 *
 *   node scripts/iniciar-proyecto.mjs --nombre "Mi proyecto" --descripcion "Qué es y para quién"
 *
 * Opciones:
 *   --repo <nombre-del-repo>   por defecto, el nombre del remoto `origin`
 *   --nombre "<Nombre>"        nombre visible; por defecto, el del repo
 *   --descripcion "<frase>"    frase de la cabecera del README
 *   --sin-extras               borra extras/ (la base de idiomas de React)
 *   --simular                  solo muestra lo que haría, sin tocar nada
 *
 * Qué hace:
 *   1. Reemplaza NOMBRE-DEL-REPO, NOMBRE DEL PROYECTO y la frase de ejemplo en
 *      todos los archivos versionados.
 *   2. Pone el README del proyecto (.plantilla/README.md) en lugar del README
 *      de la plantilla y borra .plantilla/.
 *   3. Empieza un CHANGELOG vacío para el proyecto.
 *   4. Se borra a sí mismo (y su prueba): solo sirve una vez.
 *
 * Lo que no se puede hacer desde el código (ajustes de GitHub) queda en la
 * lista «Primeros pasos» del README nuevo.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

export const PLACEHOLDERS = {
  repo: "NOMBRE-DEL-REPO",
  nombre: "NOMBRE DEL PROYECTO",
  descripcion: "Una frase que diga qué es y para quién.",
};

/** Archivos que solo sirven para iniciar y se borran al terminar. */
export const SELF_FILES = ["scripts/iniciar-proyecto.mjs", "scripts/iniciar-proyecto.test.mjs"];

const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|mp3|mp4|webm|pdf|zip|gz|wasm)$/i;
const REPO_NAME = /^[A-Za-z0-9._-]+$/;

/**
 * Reemplaza los marcadores de la plantilla en un texto.
 * @param {string} text
 * @param {{ repo: string, nombre: string, descripcion?: string }} vars
 */
export function replacePlaceholders(text, vars) {
  let out = text.split(PLACEHOLDERS.repo).join(vars.repo).split(PLACEHOLDERS.nombre).join(vars.nombre);
  if (vars.descripcion) out = out.split(PLACEHOLDERS.descripcion).join(vars.descripcion);
  // El primer paso de la lista ya quedó hecho.
  return out.replace(/- \[ \] Reemplazar `[^`]+` y `[^`]+` en todos los archivos/, (line) => line.replace("[ ]", "[x]"));
}

export const TEMPLATE_URL = "https://github.com/Juan-Carlos-Estevez-Vargas/plantilla-proyectos";

/** Cambia los enlaces relativos a extras/ por enlaces a la plantilla. */
export function pointExtrasToTemplate(text) {
  return text.replace(/\]\((?:\.\.\/|\.\/)*extras\//g, `](${TEMPLATE_URL}/tree/main/extras/`);
}

/** Lee `--clave valor` y `--bandera` de la línea de comandos. */
export function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`Argumento inesperado: ${arg}`);
    const key = arg.slice(2);
    if (["sin-extras", "simular"].includes(key)) opts[key] = true;
    else if (["repo", "nombre", "descripcion"].includes(key)) {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) throw new Error(`Falta el valor de --${key}`);
      opts[key] = value;
    } else throw new Error(`Opción desconocida: --${key}`);
  }
  return opts;
}

/** Nombre del repo según el remoto `origin` (https o ssh). */
export function repoFromRemote(url) {
  const name = basename(url.trim()).replace(/\.git$/, "");
  return REPO_NAME.test(name) ? name : null;
}

/** CHANGELOG inicial del proyecto nuevo. */
export const newChangelog = (repo) => `# Cambios

Todos los cambios importantes del proyecto. Las notas de cada versión salen de
los commits ([Conventional Commits](https://www.conventionalcommits.org/es/))
y se publican en los
[releases](https://github.com/Juan-Carlos-Estevez-Vargas/${repo}/releases).

## [Sin publicar]

- Proyecto creado desde la plantilla de proyectos.
`;

/**
 * Aplica la plantilla en `root`.
 * @param {string} root
 * @param {{ repo: string, nombre: string, descripcion?: string, sinExtras?: boolean, simular?: boolean }} opts
 * @param {string[]} files archivos versionados, relativos a root
 * @returns {string[]} lo que se hizo (o se haría)
 */
export function iniciar(root, opts, files) {
  if (!REPO_NAME.test(opts.repo)) throw new Error(`Nombre de repo no válido: ${opts.repo}`);
  if (!existsSync(join(root, ".plantilla/README.md"))) {
    throw new Error("No encuentro .plantilla/README.md: este repo ya se inició o no viene de la plantilla.");
  }
  const log = [];
  const write = (path, text) => {
    if (!opts.simular) writeFileSync(join(root, path), text);
  };

  for (const path of files) {
    if (SELF_FILES.includes(path) || BINARY.test(path) || !existsSync(join(root, path))) continue;
    const before = readFileSync(join(root, path), "utf8");
    const after = replacePlaceholders(before, opts);
    if (after !== before) {
      write(path, after);
      log.push(`marcadores reemplazados en ${path}`);
    }
  }

  if (!opts.simular) {
    renameSync(join(root, ".plantilla/README.md"), join(root, "README.md"));
    rmSync(join(root, ".plantilla"), { recursive: true, force: true });
  }
  log.push("README del proyecto en su lugar; .plantilla/ borrada");

  write("CHANGELOG.md", newChangelog(opts.repo));
  log.push("CHANGELOG nuevo");

  if (opts.sinExtras) {
    if (!opts.simular) rmSync(join(root, "extras"), { recursive: true, force: true });
    log.push("extras/ borrada");
    // Los enlaces a extras/ pasan a apuntar a la plantilla para no quedar rotos.
    for (const path of files.filter((f) => f.endsWith(".md") && !f.startsWith("extras/"))) {
      const full = join(root, path === ".plantilla/README.md" ? "README.md" : path);
      if (!existsSync(full)) continue;
      const before = readFileSync(full, "utf8");
      const after = pointExtrasToTemplate(before);
      if (after !== before) {
        if (!opts.simular) writeFileSync(full, after);
        log.push(`enlaces a extras/ apuntan a la plantilla en ${path}`);
      }
    }
  }

  for (const path of SELF_FILES) {
    if (!opts.simular) rmSync(join(root, path), { force: true });
  }
  log.push("este script se borró: ya no hace falta");
  return log;
}

function main(argv) {
  const root = process.cwd();
  const args = parseArgs(argv);
  const git = (a) => execFileSync("git", a, { cwd: root, encoding: "utf8" });
  let repo = args.repo;
  if (!repo) {
    try {
      repo = repoFromRemote(git(["remote", "get-url", "origin"]));
    } catch {
      repo = null;
    }
  }
  if (!repo) throw new Error("No pude leer el nombre del repo: pásalo con --repo nombre-del-repo");
  if (repo === "plantilla-proyectos") throw new Error("Este es el repo de la plantilla: créate uno nuevo con «Use this template».");

  const files = git(["ls-files", "-z"]).split("\0").filter(Boolean);
  const log = iniciar(
    root,
    { repo, nombre: args.nombre ?? repo, descripcion: args.descripcion, sinExtras: args["sin-extras"], simular: args.simular },
    files,
  );
  console.log(`${args.simular ? "Simulación" : "Listo"} (${repo}):\n  - ${log.join("\n  - ")}`);
  console.log("\nSigue con la lista «Primeros pasos» del README y haz el primer commit:");
  console.log('  git add -A && git commit -m "chore: iniciar proyecto desde la plantilla"');
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
