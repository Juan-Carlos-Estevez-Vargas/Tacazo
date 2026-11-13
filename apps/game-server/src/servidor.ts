import { randomBytes, randomInt } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  ENGINE_VERSION,
  MAX_MENSAJE,
  PROTOCOLO,
  leerMensajeCliente,
  type MensajeServidor,
} from "@tacazo/core";
import { leerInvitado } from "@tacazo/api/cuentas";
import { salaPorId } from "@tacazo/api/monedas";
import type { Datos } from "@tacazo/api/partidas";
import { WebSocketServer, type WebSocket } from "ws";
import { Colas, type EnCola } from "./emparejamiento.js";
import { Cubeta, LimitePorClave } from "./limite.js";
import { Sala, relojReal, type Conexion, type Reloj } from "./sala.js";
import { firmarToken, leerToken } from "./token.js";

export interface Config {
  readonly secreto: string;
  /** Orígenes del navegador permitidos (CORS y WebSocket). */
  readonly origenes: readonly string[];
  readonly reloj?: Reloj;
  /** Base de datos para la cola clasificatoria; sin ella solo hay partidas con amigos. */
  readonly datos?: Datos | null;
  /** Salas que puede crear una IP por minuto (20). Solo se sube para pruebas de carga. */
  readonly salasPorMinuto?: number;
}

const emparejado = (e: Extract<EstadoCola, { tipo: "emparejado" }>) => ({
  estado: "emparejado",
  sala: e.sala,
  jugador: e.jugador,
  token: e.token,
  rival: e.rival,
});

/** Modos y salas con cola clasificatoria. Cada sala cobra su entrada en monedas. */
export const MODOS_COLA = ["bola8"] as const;
export const SALAS_COLA = ["barrio", "club", "campeonato"] as const;
/** Quien deja de preguntar por su búsqueda durante este tiempo sale de la cola. */
export const COLA_SIN_VER_MS = 10_000;

type Buscando = {
  readonly tipo: "buscando";
  readonly modo: (typeof MODOS_COLA)[number];
  readonly sala: string;
  readonly nombre: string;
  visto: number;
};

type EstadoCola =
  | Buscando
  /** Ya tiene rival y se están cobrando las entradas; para el cliente sigue buscando. */
  | { readonly tipo: "cobrando"; readonly antes: Buscando; cancelado: boolean }
  /** Salió de la cola sin jugar; `motivo` se le muestra una vez. */
  | { readonly tipo: "fuera"; readonly motivo: string }
  | {
      readonly tipo: "emparejado";
      readonly sala: string;
      readonly jugador: 0 | 1;
      readonly token: string;
      readonly rival: string;
    };

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
  private readonly crearPorIp: LimitePorClave;
  readonly colas = new Colas();
  private readonly enCola = new Map<string, EstadoCola>();
  /** Partidas guardadas en la base: quién se sentó en cada silla. */
  private readonly clasificatorias = new Map<
    string,
    { modo: (typeof MODOS_COLA)[number]; a: string; b: string; sala: string }
  >();

  constructor(private readonly config: Config) {
    this.reloj = config.reloj ?? relojReal;
    this.crearPorIp = new LimitePorClave(config.salasPorMinuto ?? 20, 60_000);
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

  /** Jugador de la petición según su token de la API (`Authorization: Bearer inv.…`). */
  private jugadorDe(req: IncomingMessage): string | null {
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) return null;
    return leerInvitado(h.slice(7).trim(), this.config.secreto, this.reloj.ahora());
  }

  private async atenderCola(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const datos = this.config.datos;
    if (!datos)
      return this.responder(req, res, 503, {
        error: "La cola clasificatoria no está disponible",
        codigo: "sin_cola",
      });
    const j = this.jugadorDe(req);
    if (!j)
      return this.responder(req, res, 401, {
        error: "Inicia sesión para jugar clasificatorias",
        codigo: "sesion",
      });
    const ahora = this.reloj.ahora();
    const actual = this.enCola.get(j);

    if (req.method === "GET") {
      if (!actual) return this.responder(req, res, 200, { estado: "nada" });
      if (actual.tipo === "fuera") {
        this.enCola.delete(j);
        return this.responder(req, res, 200, { estado: "nada", motivo: actual.motivo });
      }
      if (actual.tipo === "buscando" || actual.tipo === "cobrando") {
        if (actual.tipo === "buscando") actual.visto = ahora;
        return this.responder(req, res, 200, { estado: "buscando" });
      }
      return this.responder(req, res, 200, emparejado(actual));
    }

    if (req.method === "DELETE") {
      if (actual?.tipo === "buscando" || actual?.tipo === "fuera") {
        this.colas.salir(j);
        this.enCola.delete(j);
      }
      if (actual?.tipo === "cobrando") {
        // Se le devuelve la entrada cuando termine el cobro en curso.
        actual.cancelado = true;
        this.enCola.delete(j);
      }
      return this.responder(req, res, 200, { estado: actual?.tipo === "emparejado" ? "emparejado" : "nada" });
    }

    if (req.method !== "POST") return this.responder(req, res, 405, { error: "Método no permitido" });
    const cuerpo = (await leerCuerpo(req)) as Record<string, unknown>;
    const modo = MODOS_COLA.find((m) => m === cuerpo.modo);
    const sala = SALAS_COLA.find((x) => x === cuerpo.sala);
    if (!modo || !sala) return this.responder(req, res, 400, { error: "Modo o sala inválidos" });
    if (actual?.tipo === "emparejado" && this.salas.get(actual.sala)?.estadoFase !== "terminada") {
      return this.responder(req, res, 200, emparejado(actual));
    }
    if (actual?.tipo === "cobrando") return this.responder(req, res, 202, { estado: "buscando" });
    const perfil = await datos.perfil(j, modo);
    if (!perfil)
      return this.responder(req, res, 401, { error: "No encontramos tu jugador", codigo: "sesion" });
    if (!perfil.juega)
      return this.responder(req, res, 403, {
        error: "Tienes una sanción que no te deja jugar",
        codigo: "sancion",
      });
    if (!perfil.clasifica)
      return this.responder(req, res, 403, {
        error: "Tienes una sanción que no te deja jugar clasificatorias",
        codigo: "sancion_clasificatoria",
      });
    const nivel = salaPorId(sala)!;
    if (perfil.saldo < nivel.entrada)
      return this.responder(req, res, 409, {
        error: `No te alcanzan las monedas: la entrada a ${nivel.nombre} cuesta ${nivel.entrada}`,
        codigo: "saldo",
      });
    this.colas.salir(j);
    this.colas.cola(modo, sala).entrar({
      id: j,
      rating: perfil.rating,
      region: perfil.region,
      recientes: perfil.recientes,
      desde: ahora,
    });
    this.enCola.set(j, { tipo: "buscando", modo, sala, nombre: limpiarNombre(perfil.nombre), visto: ahora });
    return this.responder(req, res, 202, { estado: "buscando" });
  }

  /** Forma parejas en las colas y les crea la sala. Se llama cada segundo. */
  emparejar(): number {
    const ahora = this.reloj.ahora();
    for (const [j, e] of this.enCola) {
      if (e.tipo === "buscando" && ahora - e.visto > COLA_SIN_VER_MS) {
        this.colas.salir(j);
        this.enCola.delete(j);
      }
    }
    let n = 0;
    for (const { modo, sala: nivel, pareja } of this.colas.emparejar(ahora)) {
      const ea = this.enCola.get(pareja.a.id);
      const eb = this.enCola.get(pareja.b.id);
      if (ea?.tipo !== "buscando" || eb?.tipo !== "buscando") continue;
      const id = randomBytes(9).toString("base64url");
      const ca = { tipo: "cobrando" as const, antes: ea, cancelado: false };
      const cb = { tipo: "cobrando" as const, antes: eb, cancelado: false };
      this.enCola.set(pareja.a.id, ca);
      this.enCola.set(pareja.b.id, cb);
      const p = this.cobrarYAbrir(id, modo, nivel, [pareja.a, ca], [pareja.b, cb]).finally(() =>
        this.cobrando.delete(p),
      );
      this.cobrando.add(p);
      n++;
    }
    return n;
  }

  /** Cobros de entrada en curso (las pruebas los esperan). */
  readonly cobrando = new Set<Promise<void>>();

  /**
   * Cobra la entrada a los dos y les abre la sala. Si a uno no le alcanza, sale
   * de la cola con el aviso y el otro vuelve a buscar sin perder su lugar.
   */
  private async cobrarYAbrir(
    id: string,
    modo: string,
    nivel: string,
    [a, ca]: [EnCola, Extract<EstadoCola, { tipo: "cobrando" }>],
    [b, cb]: [EnCola, Extract<EstadoCola, { tipo: "cobrando" }>],
  ): Promise<void> {
    const datos = this.config.datos!;
    const volver = (e: EnCola, c: typeof ca) => {
      if (this.enCola.get(e.id) !== c) return;
      c.antes.visto = this.reloj.ahora();
      this.enCola.set(e.id, c.antes);
      this.colas.cola(modo, nivel).entrar(e);
    };
    let falta: string | null;
    try {
      falta = await datos.cobrar(id, nivel, a.id, b.id);
    } catch (e) {
      console.error("No se pudo cobrar la entrada", id, e);
      volver(a, ca);
      volver(b, cb);
      return;
    }
    if (falta !== null) {
      for (const [e, c] of [
        [a, ca],
        [b, cb],
      ] as const) {
        if (e.id !== falta) volver(e, c);
        else if (this.enCola.get(e.id) === c)
          this.enCola.set(e.id, { tipo: "fuera", motivo: "No te alcanzan las monedas para esta sala" });
      }
      return;
    }
    if (ca.cancelado || cb.cancelado) {
      // Alguien canceló mientras se cobraba: se devuelven las dos entradas.
      await datos
        .liquidar(id, nivel, a.id, b.id, null)
        .catch((e: unknown) => console.error("No se pudo devolver la entrada", id, e));
      if (!ca.cancelado) volver(a, ca);
      if (!cb.cancelado) volver(b, cb);
      return;
    }
    const sala = new Sala(id, randomInt(0, 2 ** 32), this.reloj);
    // Saca primero quien más esperó (a).
    sala.sentar(0, ca.antes.nombre);
    sala.sentar(1, cb.antes.nombre);
    this.salas.set(id, sala);
    const m = MODOS_COLA.find((x) => x === modo)!;
    this.clasificatorias.set(id, { modo: m, a: a.id, b: b.id, sala: nivel });
    sala.alTerminar = (s) => this.guardarClasificatoria(s);
    this.enCola.set(a.id, {
      tipo: "emparejado",
      sala: id,
      jugador: 0,
      token: this.token(id, 0, ca.antes.nombre),
      rival: cb.antes.nombre,
    });
    this.enCola.set(b.id, {
      tipo: "emparejado",
      sala: id,
      jugador: 1,
      token: this.token(id, 1, cb.antes.nombre),
      rival: ca.antes.nombre,
    });
  }

  /** Promesas de guardado pendientes (las pruebas las esperan). */
  readonly guardando = new Set<Promise<void>>();

  private guardarClasificatoria(s: Sala): void {
    const meta = this.clasificatorias.get(s.id);
    const datos = this.config.datos;
    if (!meta || !datos) return;
    this.clasificatorias.delete(s.id);
    for (const j of [meta.a, meta.b]) {
      const e = this.enCola.get(j);
      if (e?.tipo === "emparejado" && e.sala === s.id) this.enCola.delete(j);
    }
    const rep = s.repeticion();
    const ganador = s.ganador === null ? null : s.ganador === 0 ? meta.a : meta.b;
    const pago = datos
      .liquidar(s.id, meta.sala, meta.a, meta.b, ganador)
      .catch((e: unknown) => console.error("No se pudo pagar el premio", s.id, e))
      .finally(() => this.guardando.delete(pago));
    this.guardando.add(pago);
    const p = datos
      .guardar({
        modo: meta.modo,
        sala: meta.sala,
        a: meta.a,
        b: meta.b,
        ganador,
        motivo: rep.motivo,
        repeticion: rep,
      })
      .catch((e: unknown) => console.error("No se pudo guardar la partida", s.id, e))
      .finally(() => this.guardando.delete(p));
    this.guardando.add(p);
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
          res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
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

      if (url.pathname === "/cola") return await this.atenderCola(req, res);

      if (partes[0] === "salas" && partes[1] && partes.length === 3) {
        const sala = this.salas.get(partes[1]);
        if (!sala)
          return this.responder(req, res, 404, { error: "La sala no existe o ya terminó", codigo: "sala" });
        if (req.method === "POST" && partes[2] === "unirse") {
          const cuerpo = (await leerCuerpo(req)) as Record<string, unknown>;
          const nombre = limpiarNombre(cuerpo.nombre);
          if (!sala.sentar(1, nombre))
            return this.responder(req, res, 409, { error: "La sala ya está llena", codigo: "llena" });
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
