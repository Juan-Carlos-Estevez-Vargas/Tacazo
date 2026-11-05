// Trabajo nocturno de señales: `DATABASE_URL=... TACAZO_UMBRALES='{...}' pnpm --filter @tacazo/api senales`.
import { basePg } from "./db.js";
import { comoModeracion, trabajoNocturno } from "./moderacion.js";
import { umbralesDe } from "./senales.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL");
  process.exit(1);
}
if (!process.env.TACAZO_UMBRALES) console.warn("Sin TACAZO_UMBRALES: se usan los umbrales de ejemplo");
const base = await basePg(url);
try {
  const r = await comoModeracion(base, (c) => trabajoNocturno(c, umbralesDe(process.env.TACAZO_UMBRALES)));
  console.log(
    `Jugadores revisados: ${r.revisados} · casos abiertos: ${r.casos} · repeticiones sin medir: ${r.fallidas}`,
  );
} finally {
  await base.cerrar();
}
