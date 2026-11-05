// Monta o pone al día la base: `DATABASE_URL=... pnpm --filter @tacazo/api migrar`.
import { basePg } from "./db.js";
import { leerMigraciones, migrar } from "./migrar.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL");
  process.exit(1);
}
const base = await basePg(url);
try {
  const hechas = await migrar(base, await leerMigraciones());
  console.log(hechas.length ? `Aplicadas: ${hechas.join(", ")}` : "La base ya está al día");
} finally {
  await base.cerrar();
}
