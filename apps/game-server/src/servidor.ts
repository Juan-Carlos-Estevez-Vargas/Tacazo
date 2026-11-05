import { randomBytes, randomInt } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  ENGINE_VERSION,
  MAX_MENSAJE,
  PROTOCOLO,
  leerMensajeCliente,
  type MensajeServidor,
} from "@tacazo/core";
import { WebSocketServer, type WebSocket } from "ws";
import { Cubeta, LimitePorClave } from "./limite.js";
import { Sala, relojReal, type Conexion, type Reloj } from "./sala.js";
import { firmarToken, leerToken } from "./token.js";

export interface Config {
  readonly secreto: string;
  /** Orígenes del navegador permitidos (CORS y WebSocket). */
  readonly origenes: readonly string[];
  readonly reloj?: Reloj;
}

/** Versión mínima del protocolo que acepta el servidor. */
export const CLIENTE_MINIMO = PROTOCOLO;
const SALUDO_MS = 5_000;
const TOKEN_MS = 6 * 60 * 60 * 1000;
const MAX_CUERPO = 1024;

/** Nombre visible: sin caracteres de control, 1 a 20 caracteres. */
export function limpiarNombre(x: unknown): string {
  if (typeof x !== "string") return "Invitado";
  const n = [...x]
    .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127 && c !== "<" && c !== ">")
    .join("")
    .trim()
    .slice(0, 20);
  return n || "Invitado";
}

function leerCuerpo(req: IncomingMessage): Promise<unknown> {
  return new Promise((ok, mal) => {
    let datos = "";
    let grande = false;
    req.setEncoding("utf8");
    req.on("data", (c: string) => {
      if (grande) return;
      datos += c;
      if (datos.length > MAX_CUERPO) {
        // Se descarta el resto sin guardarlo y se responde al terminar.
        grande = true;
        datos = "";
      }
    });
    req.on("end", () => {
      if (grande) return mal(new Error("Cuerpo demasiado grande"));
      if (!datos) return ok({});
      try {
        ok(JSON.parse(datos));
      } catch {
        mal(new Error("JSON inválido"));
      }
    });
    req.on("error", mal);
  });
}

/**
 * Servidor de partidas: HTTP para crear y unirse a salas, WebSocket para
 * jugar. Las salas viven en memoria; las repeticiones se guardarán en la base
 * de datos en la fase 3.
 */
export class ServidorPartidas {
  readonly salas = new Map<string, Sala>();
  readonly http: Server;
  private readonly ws: WebSocketServer;
  private readonly reloj: Reloj;
  private readonly crearPorIp = new LimitePorClave(20, 60_000);

  constructor(private readonly config: Config) {
    this.reloj = config.reloj ?? relojReal;
    this.http = createServer((req, res) => void this.atender(req, res));
    // Cortar peticiones lentas a propósito (slowloris).
    this.http.requestTimeout = 10_000;
    this.http.headersTimeout = 10_000;
    this.ws = new WebSocketServer({ noServer: true, maxPayload: MAX_MENSAJE });
    this.http.on("upgrade", (req, socket, head) => {
      const url = new URL(req.url ?? "/", "http://x");
      if (url.pathname !== "/ws" || !this.origenPermitido(req.headers.origin)) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }
      this.ws.handleUpgrade(req, socket, head, (ws) => this.alConectar(ws));
    });
  }

  escuchar(puerto: number, host = "0.0.0.0"): Promise<number> {
    return new Promise((ok) => {
      this.http.listen(puerto, host, () => {
        const a = this.http.address();
        ok(typeof a === "object" && a ? a.port : puerto);
      });
    });
  }

  cerrar(): Promise<void> {
    for (const c of this.ws.clients) c.terminate();
    return new Promise((ok) => this.ws.close(() => this.http.close(() => ok())));
  }

  /** Borra salas terminadas hace 10 min o sin empezar después de 1 h. */
  limpiar(): void {
    const ahora = this.reloj.ahora();
    for (const [id, s] of this.salas) {
      const vieja =
        (s.terminadaEn !== null && ahora - s.terminadaEn > 10 * 60_000) ||
        (s.estadoFase === "esperando" && ahora - s.creada > 60 * 60_000);
      if (vieja) this.salas.delete(id);
    }
  }

  private origenPermitido(origen: string | undefined): boolean {
    // Clientes nativos (sin Origin) se permiten; el token sigue siendo obligatorio.
    return origen === undefined || this.config.origenes.includes(origen);
  }

  private responder(req: IncomingMessage, res: ServerResponse, codigo: number, cuerpo: unknown): void {
    const origen = req.headers.origin;
    if (origen && this.config.origenes.includes(origen)) {
      res.setHeader("Access-Control-Allow-Origin", origen);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (codigo >= 400) res.setHeader("Connection", "close");
    res.writeHead(codigo);
    res.end(JSON.stringify(cuerpo));
  }

  private token(sala: string, jugador: 0 | 1, nombre: string): string {
    return firmarToken({ sala, jugador, nombre, vence: this.reloj.ahora() + TOKEN_MS }, this.config.secreto);
  }

  private async atender(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://x");
    const partes = url.pathname.split("/").filter(Boolean);
    try {
      if (req.method === "OPTIONS") {
        const origen = req.headers.origin;
        if (origen && this.config.origenes.includes(origen)) {
          res.setHeader("Access-Control-Allow-Origin", origen);
          res.setHeader("Access-Control-Allow-Methods", "GET, POST");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type");
          res.setHeader("Access-Control-Max-Age", "600");
          res.setHeader("Vary", "Origin");
        }
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.method === "GET" && url.pathname === "/salud")
        return this.responder(req, res, 200, { ok: true, motor: ENGINE_VERSION, protocolo: PROTOCOLO });

      if (req.method === "POST" && url.pathname === "/salas") {
        const ip = req.socket.remoteAddress ?? "?";
        if (!this.crearPorIp.permitir(ip, this.reloj.ahora()))
          return this.responder(req, res, 429, { error: "Demasiadas salas; espera un minuto" });
        const cuerpo = (await leerCuerpo(req)) as Record<string, unknown>;
        const id = randomBytes(9).toString("base64url");
        const sala = new Sala(id, randomInt(0, 2 ** 32), this.reloj);
        const nombre = limpiarNombre(cuerpo.nombre);
        sala.sentar(0, nombre);
        this.salas.set(id, sala);
        return this.responder(req, res, 201, { sala: id, jugador: 0, token: this.token(id, 0, nombre) });
      }

      if (partes[0] === "salas" && partes[1] && partes.length === 3) {
        const sala = this.salas.get(partes[1]);
        if (!sala) return this.responder(req, res, 404, { error: "La sala no existe o ya terminó" });
        if (req.method === "POST" && partes[2] === "unirse") {
          const cuerpo = (await leerCuerpo(req)) as Record<string, unknown>;
          const nombre = limpiarNombre(cuerpo.nombre);
          if (!sala.sentar(1, nombre))
            return this.responder(req, res, 409, { error: "La sala ya está llena" });
          return this.responder(req, res, 200, {
            sala: sala.id,
            jugador: 1,
            token: this.token(sala.id, 1, nombre),
          });
        }
        if (req.method === "GET" && partes[2] === "repeticion")
          return this.responder(req, res, 200, sala.repeticion());
      }
      this.responder(req, res, 404, { error: "No encontrado" });
    } catch (e) {
      this.responder(req, res, 400, { error: e instanceof Error ? e.message : "Petición inválida" });
    }
  }

  private alConectar(ws: WebSocket): void {
    const ahora = () => this.reloj.ahora();
    const cubeta = new Cubeta(20, 40, ahora());
    let sesion: { sala: Sala; jugador: 0 | 1 } | null = null;
    const conexion: Conexion = {
      enviar: (m: MensajeServidor) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
      },
      cerrar: (codigo, motivo) => ws.close(codigo, motivo),
    };
    const fallar = (
      codigo: Extract<MensajeServidor, { t: "error" }>["codigo"],
      mensaje: string,
      cierre: number,
    ) => {
      conexion.enviar({ t: "error", codigo, mensaje });
      ws.close(cierre, mensaje.slice(0, 120));
    };
    const cancelarSaludo = this.reloj.programar(SALUDO_MS, () => {
      if (!sesion) fallar("token", "No saludaste a tiempo", 4001);
    });

    ws.on("message", (datos, binario) => {
      if (binario) return fallar("abuso", "Solo se aceptan mensajes de texto", 4003);
      if (!cubeta.tomar(ahora())) return fallar("abuso", "Demasiados mensajes", 4008);
      const texto = Buffer.isBuffer(datos) ? datos.toString("utf8") : String(datos);
      const l = leerMensajeCliente(texto);
      if (!l.ok) {
        conexion.enviar({ t: "rechazo", motivo: l.motivo });
        return;
      }
      const m = l.msg;
      if (!sesion) {
        if (m.t !== "saludo") return fallar("token", "Primero hay que saludar", 4001);
        cancelarSaludo();
        if (m.motor !== ENGINE_VERSION || m.cliente < CLIENTE_MINIMO)
          return fallar("version", "Hay una versión nueva de Tacazo. Recarga para actualizar.", 4002);
        const t = leerToken(m.token, this.config.secreto, ahora());
        if (!t) return fallar("token", "Token inválido o vencido", 4001);
        const sala = this.salas.get(t.sala);
        if (!sala) return fallar("sala", "La sala no existe o ya terminó", 4004);
        sesion = { sala, jugador: t.jugador };
        sala.conectar(t.jugador, conexion);
        return;
      }
      sesion.sala.recibir(sesion.jugador, m, conexion);
    });
    ws.on("close", () => {
      cancelarSaludo();
      if (sesion) sesion.sala.desconectar(sesion.jugador, conexion);
    });
    ws.on("error", () => ws.terminate());
  }
}
