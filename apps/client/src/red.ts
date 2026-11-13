import { ENGINE_VERSION, PROTOCOLO, type MensajeCliente, type MensajeServidor } from "@tacazo/core";
import { delServidor, msg } from "./i18n/index.js";

/** Dirección del servidor de partidas: meta `tacazo-servidor` o el puerto 2567 del mismo host. */
export function urlServidor(): string {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="tacazo-servidor"]')?.content;
  return meta || `${location.protocol}//${location.hostname}:2567`;
}

export interface Asiento {
  readonly sala: string;
  readonly jugador: 0 | 1;
  readonly token: string;
}

async function pedir(ruta: string, cuerpo: unknown): Promise<Asiento> {
  const r = await fetch(`${urlServidor()}${ruta}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const datos = (await r.json().catch(() => ({}))) as Partial<Asiento> & { error?: string; codigo?: string };
  if (!r.ok || !datos.token || !datos.sala || datos.jugador === undefined)
    throw new Error(datos.error ? delServidor(datos.error, datos.codigo) : msg().comun.sinConexionServidor);
  return { sala: datos.sala, jugador: datos.jugador, token: datos.token };
}

export const crearSala = (nombre: string) => pedir("/salas", { nombre });
export const unirseSala = (sala: string, nombre: string) =>
  pedir(`/salas/${encodeURIComponent(sala)}/unirse`, { nombre });

/** Asiento guardado por sala, para volver a entrar si se recarga la página. */
export const asientoGuardado = {
  leer(sala: string): Asiento | null {
    try {
      const x = sessionStorage.getItem(`tacazo.asiento.${sala}`);
      return x ? (JSON.parse(x) as Asiento) : null;
    } catch {
      return null;
    }
  },
  guardar(a: Asiento): void {
    try {
      sessionStorage.setItem(`tacazo.asiento.${a.sala}`, JSON.stringify(a));
    } catch {
      // Sin almacenamiento: no se podrá reanudar tras recargar.
    }
  },
};

/** Cierres que no tiene sentido reintentar. */
const CIERRES_FINALES = new Set([4000, 4001, 4002, 4003, 4004, 4008]);

/**
 * Conexión con la sala. Saluda con la versión del cliente y del motor, y si
 * se cae la red reintenta con espera creciente (la sala guarda la silla 60 s).
 */
export class Red {
  private ws: WebSocket | null = null;
  private intentos = 0;
  private cerradaAPropósito = false;

  constructor(
    private readonly asiento: Asiento,
    private readonly alMensaje: (m: MensajeServidor) => void,
    private readonly alEstado: (e: "conectando" | "conectada" | "caida" | "cerrada", motivo?: string) => void,
  ) {}

  conectar(): void {
    const url = urlServidor().replace(/^http/, "ws") + "/ws";
    this.alEstado("conectando");
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.addEventListener("open", () => {
      this.intentos = 0;
      this.enviar({ t: "saludo", token: this.asiento.token, cliente: PROTOCOLO, motor: ENGINE_VERSION });
      this.alEstado("conectada");
    });
    ws.addEventListener("message", (e) => {
      try {
        this.alMensaje(JSON.parse(String(e.data)) as MensajeServidor);
      } catch {
        // Mensaje ilegible: se ignora.
      }
    });
    ws.addEventListener("close", (e) => {
      if (this.ws !== ws) return;
      if (this.cerradaAPropósito || CIERRES_FINALES.has(e.code)) {
        this.alEstado("cerrada", e.reason);
        return;
      }
      this.alEstado("caida");
      const espera = Math.min(10_000, 500 * 2 ** this.intentos++);
      setTimeout(() => this.conectar(), espera);
    });
  }

  enviar(m: MensajeCliente): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  cerrar(): void {
    this.cerradaAPropósito = true;
    this.ws?.close(1000, "fin");
  }
}
