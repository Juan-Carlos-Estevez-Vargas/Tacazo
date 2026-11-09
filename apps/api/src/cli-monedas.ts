// Panel de fuentes y sumideros: `DATABASE_URL=... pnpm --filter @tacazo/api monedas [días]`.
import { basePg } from "./db.js";
import { circulacion, comoMonedas, flujo, resumirFlujo } from "./monedas.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL");
  process.exit(1);
}
const dias = Math.max(1, Math.min(365, Number(process.argv[2] ?? 7) || 7));
const base = await basePg(url);
try {
  const { filas, masa } = await comoMonedas(base, async (c) => ({
    filas: await flujo(c, dias),
    masa: await circulacion(c),
  }));
  const r = resumirFlujo(filas);
  const n = (x: number) => x.toLocaleString("es-CO").padStart(12);
  console.log(`Monedas de los últimos ${dias} días\n`);
  console.log(`${"tipo".padEnd(12)}${"entran".padStart(12)}${"salen".padStart(12)}${"movs".padStart(10)}`);
  for (const t of r.tipos)
    console.log(`${t.tipo.padEnd(12)}${n(t.entran)}${n(t.salen)}${String(t.movimientos).padStart(10)}`);
  console.log(`${"total".padEnd(12)}${n(r.entran)}${n(r.salen)}`);
  console.log(
    `\nNeto: ${r.neto >= 0 ? "+" : ""}${r.neto.toLocaleString("es-CO")} (${r.neto > 0 ? "la masa crece" : "la masa baja o se mantiene"})`,
  );
  console.log(`En circulación: ${masa.total.toLocaleString("es-CO")} monedas en ${masa.jugadores} jugadores`);
} finally {
  await base.cerrar();
}
