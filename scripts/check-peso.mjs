// Peso del cliente ya construido. Cuenta todo `dist/` (lo de la primera carga
// más lo que se pide después, como el renderizador o los otros idiomas), así
// que la primera carga real siempre pesa menos. Falla si pasa de 3 MB.
//   node scripts/check-peso.mjs [apps/client/dist]
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

export const LIMITE = 3 * 1024 * 1024;

export function pesoCliente(dist) {
  const archivos = [];
  const recorrer = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) recorrer(p);
      else if (!e.name.startsWith(".")) {
        const datos = readFileSync(p);
        archivos.push({ ruta: relative(dist, p), bytes: datos.length, gzip: gzipSync(datos).length });
      }
    }
  };
  recorrer(dist);
  archivos.sort((a, b) => b.bytes - a.bytes);
  const total = archivos.reduce((s, a) => s + a.bytes, 0);
  const gzip = archivos.reduce((s, a) => s + a.gzip, 0);
  return { archivos, total, gzip, pasa: total <= LIMITE };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { archivos, total, gzip, pasa } = pesoCliente(process.argv[2] ?? "apps/client/dist");
  const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
  for (const a of archivos.slice(0, 8)) console.log(`${kb(a.bytes).padStart(9)} ${kb(a.gzip).padStart(8)} gz  ${a.ruta}`);
  console.log(`Cliente completo: ${kb(total)} (${kb(gzip)} comprimido), límite ${kb(LIMITE)}`);
  if (!pasa) {
    console.error("El cliente pasa de 3 MB");
    process.exit(1);
  }
}
