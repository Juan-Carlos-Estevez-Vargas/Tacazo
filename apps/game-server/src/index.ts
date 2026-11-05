import { randomBytes } from "node:crypto";
import { ENGINE_VERSION } from "@tacazo/core";
import { basePg } from "@tacazo/api/db";
import { datosPg } from "@tacazo/api/partidas";
import { ServidorPartidas } from "./servidor.js";

const produccion = process.env.NODE_ENV === "production";
let secreto = process.env.TACAZO_SECRETO ?? "";
if (secreto.length < 32) {
  if (produccion) {
    console.error("Falta TACAZO_SECRETO (mínimo 32 caracteres).");
    process.exit(1);
  }
  secreto = randomBytes(32).toString("hex");
  console.warn("TACAZO_SECRETO no está definido: uso uno al azar (los tokens no sobreviven a un reinicio).");
}
const origenes = (process.env.TACAZO_ORIGENES ?? "http://localhost:5173,http://localhost:4173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const puerto = Number(process.env.PUERTO ?? 2567);

// Sin base de datos solo hay partidas con amigos; la cola clasificatoria la necesita.
const url = process.env.DATABASE_URL;
if (!url) console.warn("Sin DATABASE_URL: la cola clasificatoria queda apagada.");
const datos = url ? datosPg(await basePg(url)) : null;

const servidor = new ServidorPartidas({ secreto, origenes, datos });
const p = await servidor.escuchar(puerto);
setInterval(() => servidor.limpiar(), 60_000).unref();
setInterval(() => servidor.emparejar(), 1_000).unref();
console.log(`Servidor de partidas Tacazo · motor v${ENGINE_VERSION} · puerto ${p}`);

const apagar = () => void servidor.cerrar().then(() => process.exit(0));
process.on("SIGTERM", apagar);
process.on("SIGINT", apagar);
