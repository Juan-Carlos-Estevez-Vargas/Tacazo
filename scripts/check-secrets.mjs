/**
 * Buscador de secretos: que ninguna clave privada llegue al repositorio ni al
 * build que se publica.
 *
 *   node scripts/check-secrets.mjs            archivos del repositorio (git ls-files)
 *   node scripts/check-secrets.mjs --history  además, todo el historial de git
 *   node scripts/check-secrets.mjs dist       archivos de una carpeta (el build)
 *
 * Termina con código 1 si encuentra algo. CI lo corre en cada push sobre el
 * repo, el historial y el build; el build puede usar assertPublicEnv() para
 * no compilar si una variable VITE_* (que viaja al navegador) trae un secreto.
 *
 * La anon key de Supabase es pública por diseño y no se marca. La service_role
 * key, sí: con ella se salta todo el RLS.
 *
 * Si una línea es un falso positivo, se le agrega el comentario
 * `secret-scan: ignore`.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const IGNORE_MARK = "secret-scan: ignore";

/** Formatos de claves conocidos. */
const PATTERNS = [
  { name: "Supabase secret key", re: /\bsb_secret_[A-Za-z0-9_-]{20,}/g },
  { name: "Token de acceso de Supabase", re: /\bsbp_[a-f0-9]{40}\b/g },
  { name: "Clave privada", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY( BLOCK)?-----/g },
  { name: "Token de GitHub", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g },
  { name: "Clave de AWS", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "Clave de Google", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "Clave secreta de Stripe", re: /\b[rs]k_live_[A-Za-z0-9]{20,}\b/g },
  { name: "Token de Slack", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
];

/** NOMBRE_SECRETO=valor con un valor real (no ${{ secrets.X }}, $VAR ni vacío). */
const ASSIGNMENT =
  /\b([A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|PRIVATE_KEY|SERVICE_ROLE_KEY|ACCESS_TOKEN|API_KEY|SMTP_PASS)[A-Z0-9_]*)\s*[=:]\s*["']?([^\s"'`$<>{}()]{12,})(?=["'\s,;]|$)/g;

const PLACEHOLDER = /^(?:x+|\*+|\.+|changeme|example|your[-_]|tu[-_]|placeholder|CORREO_|<)/i;
/** Nombres de constantes o variables (SERVICE_ROLE, SUPABASE_URL…): no son valores. */
const IDENTIFIER = /^[A-Z_][A-Z0-9_]*$/;

const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;

function jwtRole(payload) {
  try {
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json).role ?? null;
  } catch {
    return null;
  }
}

/**
 * Busca secretos en un texto.
 * @param {string} text
 * @returns {Array<{ line: number, kind: string }>}
 */
export function findSecrets(text) {
  const found = [];
  text.split("\n").forEach((content, index) => {
    if (content.includes(IGNORE_MARK)) return;
    const add = (kind) => found.push({ line: index + 1, kind });
    for (const { name, re } of PATTERNS) {
      re.lastIndex = 0;
      if (re.test(content)) add(name);
    }
    for (const match of content.matchAll(JWT)) {
      if (jwtRole(match[1]) === "service_role") add("service_role key de Supabase");
    }
    for (const match of content.matchAll(ASSIGNMENT)) {
      if (!PLACEHOLDER.test(match[2]) && !IDENTIFIER.test(match[2])) add(`Valor de ${match[1]}`);
    }
  });
  return found;
}

/** Archivos que nunca deberían estar en git, aunque estén vacíos. */
export function isForbiddenFile(path) {
  const name = path.split("/").pop() ?? "";
  if (/^\.env(\..+)?$/.test(name)) return name !== ".env.example";
  return /\.(pem|p12|pfx|key)$/i.test(name) || /^id_(rsa|dsa|ecdsa|ed25519)$/.test(name) || name === "service-account.json";
}

/**
 * Lanza un error si alguna variable VITE_* (que termina en el JavaScript que
 * descarga cualquiera) es un secreto, o si la "anon key" es en realidad la
 * service_role.
 * @param {Record<string, string | undefined>} env
 */
export function assertPublicEnv(env) {
  const problems = [];
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith("VITE_") || !value) continue;
    const trimmed = value.trim();
    if (findSecrets(trimmed).length > 0 || /^sb_secret_/.test(trimmed)) problems.push(key);
  }
  if (problems.length > 0) {
    throw new Error(
      `Las variables ${problems.join(", ")} contienen una clave secreta. Todo lo que empieza por VITE_ ` +
        "viaja al navegador: usa la anon (o publishable) key de Supabase, nunca la service_role.",
    );
  }
}

const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|mp3|mp4|webm|pdf|zip|gz|wasm)$/i;

function listDir(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? listDir(path) : [path];
  });
}

function scanFiles(paths, root) {
  const report = [];
  for (const path of paths) {
    const shown = relative(root, path) || path;
    if (isForbiddenFile(shown)) report.push(`${shown}: este archivo no debería estar versionado`);
    if (BINARY.test(path)) continue;
    let text;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    for (const hit of findSecrets(text)) report.push(`${shown}:${hit.line}: ${hit.kind}`);
  }
  return report;
}

/** Líneas agregadas en cualquier commit de cualquier rama. */
function scanHistory(root) {
  const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
  const report = [];
  for (const path of new Set(git(["log", "--all", "--name-only", "--format="]).split("\n").filter(Boolean))) {
    if (isForbiddenFile(path)) report.push(`historial: ${path} se versionó alguna vez`);
  }
  let commit = "";
  let file = "";
  for (const line of git(["log", "--all", "-p", "--no-color", "--no-ext-diff", "--format=commit %H"]).split("\n")) {
    if (line.startsWith("commit ")) commit = line.slice(7, 14);
    else if (line.startsWith("+++ b/")) file = line.slice(6);
    else if (line.startsWith("+") && !line.startsWith("+++") && !BINARY.test(file)) {
      for (const hit of findSecrets(line.slice(1))) report.push(`historial ${commit} ${file}: ${hit.kind}`);
    }
  }
  return report;
}

function main(argv) {
  const root = process.cwd();
  const dirs = argv.filter((a) => !a.startsWith("--"));
  let report;
  if (dirs.length > 0) {
    report = dirs.flatMap((dir) => scanFiles(listDir(join(root, dir)), root));
  } else {
    const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
    report = scanFiles(tracked.map((p) => join(root, p)), root);
    if (argv.includes("--history")) report.push(...scanHistory(root));
  }
  if (report.length > 0) {
    console.error(`Se encontraron ${report.length} posibles secretos:\n  ${report.join("\n  ")}`);
    console.error("\nSi es una clave real: revócala (no basta con borrarla, sigue en el historial) y guárdala en los secretos de GitHub o de Supabase.");
    process.exit(1);
  }
  console.log("Sin secretos a la vista ✔");
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main(process.argv.slice(2));
}
