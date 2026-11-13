/**
 * Errores que alguien tiene que ver. Cada uno sale en el log como una línea
 * JSON y, si hay `TACAZO_ALERTAS_WEBHOOK` (Discord o Slack), también como
 * mensaje. Para no inundar el canal: el mismo error se avisa una vez cada
 * 10 minutos y como mucho 20 avisos por hora.
 */

export type Alertar = (contexto: string, e: unknown) => void;

export interface OpcionesAlertas {
  readonly servicio: string;
  readonly webhook?: string | undefined;
  readonly fetch?: typeof fetch;
  readonly ahora?: () => number;
  readonly log?: (linea: string) => void;
}

const REPETIDO_MS = 10 * 60_000;
const POR_HORA = 20;

const texto = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

export function crearAlertas(o: OpcionesAlertas): Alertar & { pendientes: Set<Promise<void>> } {
  const f = o.fetch ?? fetch;
  const ahora = o.ahora ?? Date.now;
  const log = o.log ?? ((l: string) => console.error(l));
  const vistos = new Map<string, number>();
  let enviados: number[] = [];
  const pendientes = new Set<Promise<void>>();

  const alertar = (contexto: string, e: unknown) => {
    const t = ahora();
    const mensaje = texto(e);
    log(
      JSON.stringify({
        nivel: "error",
        servicio: o.servicio,
        contexto,
        mensaje,
        pila: e instanceof Error ? e.stack?.split("\n").slice(1, 4).join(" | ") : undefined,
        hora: new Date(t).toISOString(),
      }),
    );
    if (!o.webhook) return;
    const clave = `${contexto}|${mensaje}`;
    const antes = vistos.get(clave);
    if (antes !== undefined && t - antes < REPETIDO_MS) return;
    enviados = enviados.filter((x) => t - x < 3_600_000);
    if (enviados.length >= POR_HORA) return;
    vistos.set(clave, t);
    if (vistos.size > 1000) vistos.clear();
    enviados.push(t);
    const linea = `⚠️ ${o.servicio} · ${contexto}: ${mensaje}`;
    // `content` lo lee Discord y `text` lo lee Slack.
    const p = f(o.webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: linea, text: linea }),
      signal: AbortSignal.timeout(5000),
    })
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => pendientes.delete(p));
    pendientes.add(p);
  };
  return Object.assign(alertar, { pendientes });
}

/** Avisa de errores que nadie atrapó; si el proceso queda en mal estado, sale para que lo reinicien. */
export function vigilarProceso(alertar: Alertar & { pendientes: Set<Promise<void>> }): void {
  process.on("unhandledRejection", (e) => alertar("promesa sin atrapar", e));
  process.on("uncaughtException", (e) => {
    alertar("excepción sin atrapar", e);
    void Promise.allSettled([...alertar.pendientes]).finally(() => process.exit(1));
  });
}
