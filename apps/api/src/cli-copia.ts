// Revisa una copia restaurada: `DATABASE_URL=<copia> [ORIGEN_URL=<origen>] pnpm --filter @tacazo/api comprobar-copia`.
import { revisarCopia, TABLAS } from "./copias.js";
import { basePg, type Base } from "./db.js";
import { leerMigraciones } from "./migrar.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL (la base restaurada)");
  process.exit(1);
}
const copia = await basePg(url);
let origen: Base | undefined;
try {
  if (process.env.ORIGEN_URL) origen = await basePg(process.env.ORIGEN_URL);
  const r = await revisarCopia(copia, await leerMigraciones(), origen);
  console.log(`${"tabla".padEnd(14)}${"copia".padStart(10)}${r.origen ? "origen".padStart(10) : ""}`);
  for (const t of TABLAS)
    console.log(
      `${t.padEnd(14)}${String(r.filas[t]).padStart(10)}${r.origen ? String(r.origen[t]).padStart(10) : ""}`,
    );
  if (r.ok) console.log("\nLa copia está completa y los libros de monedas cuadran ✔");
  else {
    console.error(`\nLa copia tiene problemas:\n  ${r.problemas.join("\n  ")}`);
    process.exitCode = 1;
  }
} finally {
  await copia.cerrar();
  await origen?.cerrar();
}
