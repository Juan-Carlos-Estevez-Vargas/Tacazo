// Vigilancia: pide /salud a cada servicio y avisa si alguno no responde.
//
//   TACAZO_URL_API=https://api... TACAZO_URL_PARTIDAS=https://partidas... node scripts/vigilar.mjs
//
// Sale con 1 si algo falla (GitHub avisa por correo de un flujo programado en
// rojo) y, si hay TACAZO_ALERTAS_WEBHOOK, también manda un mensaje a Discord
// o Slack. Sin URLs no hace nada: el juego todavía no está publicado.

const LENTO_MS = 3000;

/** Revisa un servicio. Devuelve null si está bien, o el motivo del fallo. */
export async function revisar(nombre, url, f = fetch) {
  const t = Date.now();
  try {
    const r = await f(new URL("/salud", url), { signal: AbortSignal.timeout(10_000) });
    const ms = Date.now() - t;
    const cuerpo = await r.json().catch(() => ({}));
    if (!r.ok || cuerpo.ok !== true) return `${nombre}: respondió ${r.status}`;
    if (ms > LENTO_MS) return `${nombre}: tardó ${ms} ms`;
    return null;
  } catch (e) {
    return `${nombre}: no responde (${e instanceof Error ? e.message : String(e)})`;
  }
}

export async function vigilar(env, f = fetch, log = console.log) {
  const servicios = [
    ["API", env.TACAZO_URL_API],
    ["Partidas", env.TACAZO_URL_PARTIDAS],
  ].filter(([, url]) => url);
  if (!servicios.length) {
    log("Sin TACAZO_URL_API ni TACAZO_URL_PARTIDAS: nada que vigilar.");
    return [];
  }
  const fallos = (await Promise.all(servicios.map(([n, u]) => revisar(n, u, f)))).filter(Boolean);
  for (const [n] of servicios) if (!fallos.some((x) => x.startsWith(`${n}:`))) log(`${n} en orden ✔`);
  if (fallos.length && env.TACAZO_ALERTAS_WEBHOOK) {
    const linea = `🚨 Tacazo caído\n${fallos.join("\n")}`;
    await f(env.TACAZO_ALERTAS_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: linea, text: linea }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => undefined);
  }
  return fallos;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const fallos = await vigilar(process.env);
  if (fallos.length) {
    console.error(fallos.join("\n"));
    process.exit(1);
  }
}
