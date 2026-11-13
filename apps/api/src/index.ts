import { ENGINE_VERSION } from "@tacazo/core";
import { crearAlertas, vigilarProceso } from "./alertas.js";
import { crearApi } from "./app.js";
import { turnstile, verificadorNeon } from "./cuentas.js";
import { basePg } from "./db.js";

const env = process.env;
const produccion = env.NODE_ENV === "production";
const falta = (k: string) => {
  console.error(`Falta la variable ${k}`);
  process.exit(1);
};

const url = env.DATABASE_URL ?? falta("DATABASE_URL");
const neonAuth = env.NEON_AUTH_URL ?? falta("NEON_AUTH_URL");
const secreto = env.TACAZO_SECRETO ?? (produccion ? falta("TACAZO_SECRETO") : "solo-para-desarrollo");
if (produccion && !env.TURNSTILE_SECRETO) falta("TURNSTILE_SECRETO");

const alertar = crearAlertas({ servicio: "api", webhook: env.TACAZO_ALERTAS_WEBHOOK });
vigilarProceso(alertar);

const app = await crearApi({
  alertar,
  base: await basePg(url!),
  secreto: secreto!,
  verificarCuenta: verificadorNeon(neonAuth!),
  verificarHumano: env.TURNSTILE_SECRETO ? turnstile(env.TURNSTILE_SECRETO) : null,
  origenes: (env.TACAZO_ORIGENES ?? "http://localhost:5173").split(",").map((s) => s.trim()),
});
const puerto = Number(env.PUERTO ?? 3000);
await app.listen({ port: puerto, host: "0.0.0.0" });
console.log(`API Tacazo en :${puerto} · motor v${ENGINE_VERSION}`);
