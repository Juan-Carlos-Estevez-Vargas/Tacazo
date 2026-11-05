import {
  POOL_9FT,
  bola8,
  botMove,
  createRng,
  createWorld,
  rack8,
  simulateShot,
  worldHash,
  type BallInit,
  type BotLevel,
  type EntradaRepeticion,
  type MensajeServidor,
  type Repeticion,
  type Rng,
  type Shot,
  type SimEvent,
  type Snapshot,
  type World,
} from "@tacazo/core";
import type { FederatedPointerEvent } from "pixi.js";
import { trazarGuia } from "./guia.js";
import { BOLAS_POOL } from "./marca.js";
import { VistaMesa, type PuntoMesa } from "./mesa.js";
import { buscarRival, hayInvitado, invitado, sesionJuego } from "./cuenta.js";
import { Red, asientoGuardado, crearSala, unirseSala, urlServidor, type Asiento } from "./red.js";
import { Grabacion, eventosEnTiempo } from "./reproduccion.js";
import { Sonido } from "./sonido.js";

type Modo = "bot" | "red" | "repeticion";
/**
 * apuntando: me toca. animando: se ve un tiro. rival: le toca al otro.
 * esperando: espero al servidor o a que llegue el amigo. fin: terminó.
 */
type Fase = "apuntando" | "animando" | "rival" | "esperando" | "fin";
type Jugador = 0 | 1;

const FALTAS: Record<bola8.Foul, string> = {
  "blanca-en-tronera": "la blanca cayó",
  "sin-contacto": "no tocó ninguna bola",
  "primera-bola-incorrecta": "tocó primero una bola que no era",
  "sin-banda": "ninguna bola tocó banda",
  "saque-ilegal": "saque ilegal",
  tiempo: "se acabó el tiempo",
};

const DERROTAS: Record<bola8.LossReason, string> = {
  "8-antes-de-tiempo": "metió la 8 antes de tiempo",
  "8-en-otra-tronera": "metió la 8 en otra tronera",
  "8-con-falta": "metió la 8 con falta",
  "8-sin-cantar": "metió la 8 sin cantar tronera",
  abandono: "abandonó la partida",
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function semilla(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]!;
}

function leerNombre(): string {
  try {
    return localStorage.getItem("tacazo.nombre") ?? "";
  } catch {
    return "";
  }
}

function guardarNombre(n: string): void {
  try {
    localStorage.setItem("tacazo.nombre", n);
  } catch {
    // Sin almacenamiento: se pedirá otra vez.
  }
}

type Veredicto = Pick<bola8.ShotVerdict, "fouls" | "keepsTurn" | "respot">;

/** Partida de bola 8: contra el bot, contra un amigo por enlace o en repetición. */
export class Juego {
  private mundo!: World;
  private estado!: bola8.Bola8State;
  private rng!: Rng;
  private modo: Modo = "bot";
  private fase: Fase = "apuntando";
  private yo: Jugador = 0;
  private nombres: [string, string] = ["Tú", "Bot"];
  private conectados: [boolean, boolean] = [true, true];
  private angulo = 0;
  private potencia = 0;
  private efecto = { side: 0, top: 0 };
  private inclinacion = 0;
  private cantada: number | null = null;
  private moviendoBlanca = false;
  private grabacion: Grabacion | null = null;
  private eventos: { e: SimEvent; t: number }[] = [];
  private reloj = 0;
  private inicioAnimacion = 0;
  private pendiente: (() => void) | null = null;
  private nivel: BotLevel = "medio";
  private readonly reducirMovimiento = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Partida en red.
  private red: Red | null = null;
  private asiento: Asiento | null = null;
  private seq = 0;
  private turnoVence: number | null = null;
  private ultimoApuntado = 0;
  /** Mensajes que llegan mientras se anima un tiro; se aplican al terminar. */
  private cola: MensajeServidor[] = [];
  // Repetición local (contra el bot) o descargada del servidor.
  private inicio: BallInit[] = [];
  private entradas: EntradaRepeticion[] = [];
  private repeticion: { rep: Repeticion; i: number; reglas: bola8.Bola8State; huellasOk: boolean } | null =
    null;

  constructor(
    private readonly vista: VistaMesa,
    private readonly sonido: Sonido,
  ) {}

  iniciar(): void {
    this.vista.alAjustar = () => this.redibujar();
    const stage = this.vista.app.stage;
    stage.on("pointerdown", (e) => this.alTocar(e));
    stage.on("pointermove", (e) => this.alMover(e));
    stage.on("pointerup", () => (this.moviendoBlanca = false));
    stage.on("pointerupoutside", () => (this.moviendoBlanca = false));
    this.vista.app.ticker.add(() => {
      this.cuadro();
      this.relojTurno();
    });
    this.controles();
    const sala = new URLSearchParams(location.search).get("sala");
    if (sala) void this.entrarASala(sala);
    else this.nuevaContraBot();
  }

  private get blanca() {
    return this.mundo.balls.find((b) => b.id === 0)!;
  }

  private get miTurno(): boolean {
    return (
      !!this.estado && this.fase === "apuntando" && this.estado.turn === this.yo && this.modo !== "repeticion"
    );
  }

  // ---------- Partidas ----------

  nuevaContraBot(): void {
    this.salirDeLaRed();
    this.modo = "bot";
    this.yo = 0;
    this.nombres = ["Tú", "Bot"];
    this.conectados = [true, true];
    this.rng = createRng(semilla());
    this.inicio = rack8(POOL_9FT, this.rng);
    this.mundo = createWorld(POOL_9FT, this.inicio);
    this.estado = bola8.newGame(0);
    this.entradas = [];
    this.fase = "apuntando";
    this.cantada = null;
    this.angulo = 0;
    this.turnoVence = null;
    this.mostrarRepeticion(false);
    this.aviso("Tu saque. Puedes mover la blanca detrás de la línea.");
    this.redibujar();
  }

  private salirDeLaRed(): void {
    this.red?.cerrar();
    this.red = null;
    this.asiento = null;
    this.cola = [];
    if (location.search) history.replaceState(null, "", location.pathname);
  }

  /** Crea una sala, muestra el enlace para el amigo y se conecta. */
  async jugarConAmigo(nombre: string): Promise<void> {
    try {
      const a = await crearSala(nombre);
      asientoGuardado.guardar(a);
      history.replaceState(null, "", `${location.pathname}?sala=${encodeURIComponent(a.sala)}`);
      this.conectarA(a);
      this.mostrarEnlace(a.sala);
    } catch (e) {
      this.aviso(e instanceof Error ? e.message : "No se pudo crear la partida");
    }
  }

  private cancelarBusqueda: (() => void) | null = null;

  /** Entra a la cola clasificatoria y, al encontrar rival, se sienta en la sala. */
  async jugarClasificatoria(): Promise<void> {
    if (this.cancelarBusqueda) return;
    let nombre = "Invitado";
    if (!hayInvitado()) {
      const n = await this.pedirNombre("Partida clasificatoria");
      if (n === null) return;
      nombre = n;
    }
    const panel = $("buscando");
    const texto = $("buscando-texto");
    const terminar = () => {
      this.cancelarBusqueda = null;
      panel.hidden = true;
    };
    try {
      texto.textContent = "Preparando tu jugador…";
      panel.hidden = false;
      this.cancelarBusqueda = terminar;
      const yo = await invitado(nombre);
      const token = await sesionJuego(yo);
      if (!this.cancelarBusqueda) return;
      const inicio = performance.now();
      this.cancelarBusqueda = (() => {
        const cancelar = buscarRival(
          token,
          (e) => {
            if (e.estado === "buscando") {
              const s = Math.round((performance.now() - inicio) / 1000);
              texto.textContent = `Buscando rival de tu nivel… ${s} s`;
              return;
            }
            terminar();
            const a = { sala: e.sala, jugador: e.jugador, token: e.token };
            asientoGuardado.guardar(a);
            history.replaceState(null, "", `${location.pathname}?sala=${encodeURIComponent(a.sala)}`);
            $("enlace").hidden = true;
            this.conectarA(a);
            this.aviso(`Rival encontrado: ${e.rival}`);
          },
          (motivo) => {
            terminar();
            this.aviso(motivo);
          },
        );
        return () => {
          cancelar();
          terminar();
        };
      })();
    } catch (e) {
      terminar();
      this.aviso(e instanceof Error ? e.message : "No se pudo buscar rival");
    }
  }

  private async entrarASala(sala: string): Promise<void> {
    const guardado = asientoGuardado.leer(sala);
    if (guardado) {
      this.conectarA(guardado);
      return;
    }
    const nombre = await this.pedirNombre("Te invitaron a una partida");
    if (nombre === null) {
      this.nuevaContraBot();
      return;
    }
    try {
      const a = await unirseSala(sala, nombre);
      asientoGuardado.guardar(a);
      this.conectarA(a);
    } catch (e) {
      this.nuevaContraBot();
      this.aviso(e instanceof Error ? e.message : "No se pudo entrar a la partida");
    }
  }

  private conectarA(a: Asiento): void {
    this.red?.cerrar();
    this.modo = "red";
    this.asiento = a;
    this.yo = a.jugador;
    this.seq = 0;
    this.fase = "esperando";
    this.mostrarRepeticion(false);
    this.aviso("Conectando…");
    this.red = new Red(
      a,
      (m) => this.alMensaje(m),
      (e, motivo) => {
        if (e === "caida") this.aviso("Se cayó la conexión. Reconectando…");
        if (e === "cerrada" && motivo) this.aviso(motivo);
      },
    );
    this.red.conectar();
  }

  private alMensaje(m: MensajeServidor): void {
    if (this.fase === "animando" && m.t !== "apunta") {
      this.cola.push(m);
      return;
    }
    switch (m.t) {
      case "bienvenida":
        this.yo = m.jugador;
        this.cargar(m.estado);
        // Al volver a entrar, la secuencia sigue donde la dejó el servidor.
        this.seq = m.estado.secuencias[this.yo];
        break;
      case "estado":
        this.cargar(m.estado);
        break;
      case "apunta":
        if (this.fase === "rival") {
          this.angulo = m.angulo;
          this.redibujar(true);
        }
        break;
      case "resultado":
        this.verResultado(m);
        break;
      case "tiempo":
        this.cargar(m.estado);
        this.sonido.falta();
        this.aviso(
          `A ${m.jugador === this.yo ? "ti" : this.nombres[m.jugador]} se le acabó el tiempo. ${this.textoTurno()}`,
        );
        break;
      case "rechazo":
        if (this.fase === "esperando" && this.estado.turn === this.yo) {
          this.seq--;
          this.fase = "apuntando";
        }
        this.aviso(m.motivo);
        this.redibujar();
        break;
      case "error":
        this.fase = "fin";
        this.aviso(m.mensaje);
        if (m.codigo === "version") $("version").hidden = false;
        break;
    }
  }

  /** Toma el estado del servidor como verdad. */
  private cargar(e: Snapshot): void {
    this.mundo = createWorld(POOL_9FT, e.bolas);
    for (const b of this.mundo.balls) b.onTable = e.bolas.find((x) => x.id === b.id)!.onTable;
    this.mundo.step = e.paso;
    this.estado = e.reglas;
    this.nombres = [e.jugadores[0]?.nombre || "Jugador 1", e.jugadores[1]?.nombre || "Esperando…"];
    // Una silla vacía no cuenta como desconectada.
    const conectado = (j: Snapshot["jugadores"][number] | undefined) => !j?.nombre || j.conectado;
    this.conectados = [conectado(e.jugadores[0]), conectado(e.jugadores[1])];
    this.turnoVence = e.turnoRestante === null ? null : performance.now() + e.turnoRestante;
    if (e.fase === "esperando") {
      this.fase = "esperando";
      this.aviso("Esperando a tu amigo. Comparte el enlace.");
    } else if (e.fase === "terminada") {
      this.fase = "fin";
      this.anunciarFin(e.reglas, null);
    } else {
      this.fase = e.reglas.turn === this.yo ? "apuntando" : "rival";
      if (this.estado.ballInHand !== "no" && this.fase === "apuntando") this.dejarBlanca();
      const caido = this.conectados[this.yo === 0 ? 1 : 0]
        ? ""
        : "Tu rival se desconectó; lo esperamos 60 s. ";
      this.aviso(caido + this.textoTurno());
      $("enlace").hidden = true;
    }
    this.redibujar();
  }

  private textoTurno(): string {
    if (this.estado.turn === this.yo) {
      const mano = this.estado.ballInHand !== "no" ? "Tienes bola en mano: arrastra la blanca. " : "";
      const ocho = bola8.needsCall(this.estado, bola8.ballsOnTable(this.mundo))
        ? "Te toca la 8: canta tronera. "
        : "";
      return `${mano}${ocho}${mano || ocho ? "" : "Tu turno."}`;
    }
    return `Turno de ${this.nombres[this.estado.turn]}…`;
  }

  // ---------- Entrada ----------

  private alTocar(e: FederatedPointerEvent): void {
    this.sonido.despertar();
    if (!this.miTurno) return;
    const p = this.vista.aMesa(e);
    const c = this.blanca;
    const R = POOL_9FT.ballRadius;
    if (this.estado.ballInHand !== "no" && (p.x - c.x) ** 2 + (p.y - c.y) ** 2 < (R * 2.5) ** 2) {
      this.moviendoBlanca = true;
      return;
    }
    if (bola8.needsCall(this.estado, bola8.ballsOnTable(this.mundo))) {
      const t = this.vista.troneraCerca(p);
      if (t !== null) {
        this.cantada = t;
        this.aviso("Tronera cantada. Apunta y tira.");
        this.redibujar();
        return;
      }
    }
    this.apuntarA(p);
  }

  private alMover(e: FederatedPointerEvent): void {
    if (!this.miTurno) return;
    const p = this.vista.aMesa(e);
    if (this.moviendoBlanca) {
      if (bola8.canPlaceCueBall(this.mundo, this.estado.ballInHand, p.x, p.y))
        bola8.placeCueBall(this.mundo, this.estado.ballInHand, p.x, p.y);
      this.redibujar();
      return;
    }
    if (e.buttons > 0 || e.pointerType === "mouse") this.apuntarA(p);
  }

  private apuntarA(p: PuntoMesa): void {
    const c = this.blanca;
    if (Math.abs(p.x - c.x) + Math.abs(p.y - c.y) < 0.01) return;
    this.angulo = Math.atan2(p.y - c.y, p.x - c.x);
    this.enviarApuntado();
    this.redibujar();
  }

  private enviarApuntado(): void {
    if (this.modo !== "red") return;
    const ahora = performance.now();
    if (ahora - this.ultimoApuntado < 120) return;
    this.ultimoApuntado = ahora;
    this.red?.enviar({ t: "apuntar", angulo: this.angulo });
  }

  private controles(): void {
    const barra = $("potencia");
    const relleno = $("potencia-relleno");
    const leer = (e: PointerEvent) => {
      const r = barra.getBoundingClientRect();
      const vertical = r.height > r.width;
      const v = vertical ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width;
      this.potencia = Math.max(0, Math.min(1, v));
      relleno.style.setProperty("--p", String(this.potencia));
      barra.setAttribute("aria-valuenow", String(Math.round(this.potencia * 100)));
      this.redibujar();
    };
    barra.addEventListener("pointerdown", (e) => {
      this.sonido.despertar();
      if (!this.miTurno) return;
      barra.setPointerCapture(e.pointerId);
      leer(e);
    });
    barra.addEventListener("pointermove", (e) => {
      if (barra.hasPointerCapture(e.pointerId)) leer(e);
    });
    barra.addEventListener("pointerup", (e) => {
      if (!barra.hasPointerCapture(e.pointerId)) return;
      barra.releasePointerCapture(e.pointerId);
      const p = this.potencia;
      this.potencia = 0;
      relleno.style.setProperty("--p", "0");
      if (p >= 0.03) this.tirar(p);
      else this.redibujar();
    });

    const bola = $("efecto");
    const punto = $("efecto-punto");
    const ponerEfecto = (e: PointerEvent) => {
      const r = bola.getBoundingClientRect();
      let x = ((e.clientX - r.left) / r.width) * 2 - 1;
      let y = -(((e.clientY - r.top) / r.height) * 2 - 1);
      const l = Math.hypot(x, y);
      if (l > 0.95) {
        x = (x / l) * 0.95;
        y = (y / l) * 0.95;
      }
      this.efecto = { side: x, top: y };
      punto.style.left = `${50 + x * 50}%`;
      punto.style.top = `${50 - y * 50}%`;
    };
    bola.addEventListener("pointerdown", (e) => {
      bola.setPointerCapture(e.pointerId);
      ponerEfecto(e);
    });
    bola.addEventListener("pointermove", (e) => {
      if (bola.hasPointerCapture(e.pointerId)) ponerEfecto(e);
    });
    bola.addEventListener("dblclick", () => {
      this.efecto = { side: 0, top: 0 };
      punto.style.left = punto.style.top = "50%";
    });

    const inc = $<HTMLInputElement>("inclinacion");
    inc.addEventListener("input", () => (this.inclinacion = Number(inc.value)));

    const nivel = $<HTMLSelectElement>("nivel");
    nivel.addEventListener("change", () => (this.nivel = nivel.value as BotLevel));
    $("nueva").addEventListener("click", () => this.nuevaContraBot());
    $("amigo").addEventListener("click", () => {
      void this.pedirNombre("Jugar con un amigo").then((n) => {
        if (n !== null) void this.jugarConAmigo(n);
      });
    });
    $("clasificatoria").addEventListener("click", () => void this.jugarClasificatoria());
    $("cancelar-busqueda").addEventListener("click", () => this.cancelarBusqueda?.());
    $("ver-repeticion").addEventListener("click", () => void this.verRepeticion());
    $("copiar-enlace").addEventListener("click", () => {
      const url = $<HTMLInputElement>("enlace-url").value;
      if (navigator.share)
        void navigator.share({ title: "Tacazo", text: "¿Echamos una de bola 8?", url }).catch(() => {});
      else
        void navigator.clipboard
          ?.writeText(url)
          .then(() => this.aviso("Enlace copiado. Mándaselo a tu amigo."));
    });
    const sonido = $<HTMLButtonElement>("sonido");
    sonido.addEventListener("click", () => {
      this.sonido.activo = !this.sonido.activo;
      sonido.setAttribute("aria-pressed", String(!this.sonido.activo));
      sonido.textContent = this.sonido.activo ? "Sonido: sí" : "Sonido: no";
    });

    window.addEventListener("keydown", (e) => {
      if (!this.miTurno || (e.target as HTMLElement).tagName === "INPUT") return;
      const paso = e.shiftKey ? 0.001 : 0.01;
      if (e.key === "ArrowLeft") this.angulo += paso;
      else if (e.key === "ArrowRight") this.angulo -= paso;
      else return;
      e.preventDefault();
      this.enviarApuntado();
      this.redibujar();
    });
  }

  private pedirNombre(titulo: string): Promise<string | null> {
    const d = $<HTMLDialogElement>("dialogo-nombre");
    const input = $<HTMLInputElement>("nombre");
    $("dialogo-titulo").textContent = titulo;
    input.value = leerNombre();
    d.showModal();
    return new Promise((ok) => {
      d.addEventListener(
        "close",
        () => {
          if (d.returnValue !== "ok") return ok(null);
          const n = input.value.trim().slice(0, 20) || "Invitado";
          guardarNombre(n);
          ok(n);
        },
        { once: true },
      );
    });
  }

  private mostrarEnlace(sala: string): void {
    const url = `${location.origin}${location.pathname}?sala=${encodeURIComponent(sala)}`;
    $<HTMLInputElement>("enlace-url").value = url;
    $("copiar-enlace").textContent = "share" in navigator ? "Compartir" : "Copiar enlace";
    $("enlace").hidden = false;
  }

  private mostrarRepeticion(v: boolean): void {
    $("ver-repeticion").hidden = !v;
  }

  // ---------- Tiros ----------

  private tirar(potencia: number): void {
    const on = bola8.ballsOnTable(this.mundo);
    if (bola8.needsCall(this.estado, on) && this.cantada === null) {
      this.aviso("Te toca la 8: toca la tronera donde la vas a meter.");
      return;
    }
    const shot: Shot = {
      angle: this.angulo,
      power: Math.max(0.02, potencia),
      side: this.efecto.side,
      top: this.efecto.top,
      elevation: this.inclinacion,
    };
    const call = this.cantada === null ? {} : { pocket: this.cantada };
    if (this.modo === "red") {
      const c = this.blanca;
      this.seq++;
      this.fase = "esperando";
      this.red?.enviar({
        t: "tirar",
        seq: this.seq,
        tiro: shot,
        ...(this.cantada === null ? {} : { cantar: this.cantada }),
        ...(this.estado.ballInHand !== "no" ? { blanca: { x: c.x, y: c.y } } : {}),
      });
      this.redibujar();
      return;
    }
    this.tiroLocal(
      shot,
      call,
      this.estado.ballInHand !== "no" ? { x: this.blanca.x, y: this.blanca.y } : null,
    );
  }

  /** Tiro contra el bot: se simula y se juzga aquí mismo. */
  private tiroLocal(shot: Shot, call: bola8.ShotCall, blanca: { x: number; y: number } | null): void {
    const jugador = this.estado.turn;
    const antes = bola8.ballsOnTable(this.mundo);
    const events = this.animar(shot, () => {
      const v = bola8.judgeShot(this.estado, antes, events, call);
      this.entradas.push({
        tipo: "tiro",
        jugador,
        seq: this.entradas.length + 1,
        tiro: shot,
        cantar: call.pocket ?? null,
        blanca,
        hash: worldHash(this.mundo),
      });
      for (const id of v.respot) bola8.spotBall(this.mundo, id);
      this.despues(v, v.state, jugador);
    });
  }

  /** Tiro que decidió el servidor: se anima igual y al final manda su estado. */
  private verResultado(m: Extract<MensajeServidor, { t: "resultado" }>): void {
    if (m.blanca) {
      const c = this.blanca;
      c.x = m.blanca.x;
      c.y = m.blanca.y;
      c.onTable = true;
    }
    this.animar(m.tiro, () => {
      if (worldHash(this.mundo) !== m.hash)
        console.warn("La simulación local no coincide con la del servidor");
      const quien = m.jugador;
      this.cargar(m.estado);
      this.mensajeVeredicto(m.veredicto, m.estado.reglas, quien);
      this.vaciarCola();
    });
  }

  /** Simula el tiro sobre el mundo actual, lo graba y lo reproduce. Devuelve los eventos. */
  private animar(shot: Shot, alTerminar: () => void): SimEvent[] {
    const primerPaso = this.mundo.step;
    const blanca = { x: this.blanca.x, y: this.blanca.y };
    const grab = new Grabacion(this.mundo);
    const res = simulateShot(this.mundo, shot, (w) => grab.grabar(w));
    this.grabacion = grab;
    this.eventos = eventosEnTiempo(res.events, primerPaso - 1);
    this.reloj = 0;
    this.inicioAnimacion = performance.now();
    this.fase = "animando";
    this.sonido.taco(shot.power);
    if (!this.reducirMovimiento) this.vista.polvoDeTiza(blanca, shot.angle);
    this.vista.dibujarGuia(blanca, null);
    this.vista.dibujarTaco(null, 0, 0);
    this.vista.dibujarMarcas({});
    this.pendiente = alTerminar;
    return [...res.events];
  }

  private vaciarCola(): void {
    const cola = this.cola;
    this.cola = [];
    for (const m of cola) this.alMensaje(m);
  }

  private nombreDe(j: Jugador): string {
    return j === this.yo ? "Tú" : this.nombres[j];
  }

  private mensajeVeredicto(v: Veredicto, nuevo: bola8.Bola8State, quien: Jugador): void {
    let msg = "";
    if (v.fouls.length) {
      this.sonido.falta();
      msg = `Falta: ${v.fouls.map((f) => FALTAS[f]).join(", ")}. `;
    }
    if (v.respot.includes(8)) msg += "La 8 vuelve al punto de pie. ";
    if (nuevo.phase === "terminada") return;
    if (nuevo.turn === this.yo) this.sonido.turno();
    if (msg === "" && v.keepsTurn && quien === this.yo) msg = "¡Bien! Sigues tú. ";
    this.aviso(msg + this.textoTurno());
  }

  private despues(v: bola8.ShotVerdict, nuevo: bola8.Bola8State, quien: Jugador): void {
    this.estado = nuevo;
    this.cantada = null;
    if (nuevo.phase === "terminada") {
      this.fase = "fin";
      this.anunciarFin(nuevo, quien);
      this.redibujar();
      return;
    }
    if (nuevo.ballInHand !== "no") this.dejarBlanca();
    this.mensajeVeredicto(v, nuevo, quien);
    if (nuevo.turn === this.yo) this.fase = "apuntando";
    else {
      this.fase = "rival";
      setTimeout(() => this.turnoBot(), 900);
    }
    this.redibujar();
  }

  private anunciarFin(r: bola8.Bola8State, quien: Jugador | null): void {
    this.cantada = null;
    this.turnoVence = null;
    const gane = r.winner === this.yo;
    if (gane) this.sonido.victoria();
    else this.sonido.falta();
    const perdedor = r.winner === null ? null : r.winner === 0 ? 1 : 0;
    const culpa =
      r.loss && perdedor !== null ? ` ${this.nombreDe(quien ?? perdedor)} ${DERROTAS[r.loss]}.` : "";
    const quienGana = gane ? "¡Ganaste!" : `Ganó ${r.winner === null ? "nadie" : this.nombres[r.winner]}.`;
    this.aviso(`${quienGana}${culpa}`);
    this.mostrarRepeticion(true);
  }

  /** Si la blanca cayó, la deja en un sitio válido para que se pueda mover. */
  private dejarBlanca(): void {
    const c = this.blanca;
    const hand = this.estado.ballInHand;
    if (c.onTable && bola8.canPlaceCueBall(this.mundo, hand, c.x, c.y)) return;
    const { headStringX, height, width } = POOL_9FT;
    for (let i = 0; i < 400; i++) {
      const x =
        hand === "cabecera" ? headStringX * (0.5 + 0.45 * Math.sin(i)) : width * ((i % 20) / 20 + 0.02);
      const y = height * (0.5 + 0.4 * Math.cos(i * 1.7));
      if (bola8.canPlaceCueBall(this.mundo, hand, x, y)) {
        bola8.placeCueBall(this.mundo, hand, x, y);
        return;
      }
    }
  }

  private turnoBot(): void {
    if (this.fase !== "rival" || this.modo !== "bot") return;
    const m = botMove(this.mundo, this.estado, this.nivel, this.rng);
    if (m.place) bola8.placeCueBall(this.mundo, this.estado.ballInHand, m.place.x, m.place.y);
    this.angulo = m.shot.angle;
    this.cantada = m.call.pocket ?? null;
    this.redibujar(true);
    setTimeout(() => this.tiroLocal(m.shot, m.call, m.place ?? null), 700);
  }

  // ---------- Repetición ----------

  private async verRepeticion(): Promise<void> {
    let rep: Repeticion;
    if (this.modo === "red" && this.asiento) {
      try {
        const r = await fetch(`${urlServidor()}/salas/${encodeURIComponent(this.asiento.sala)}/repeticion`);
        if (!r.ok) throw new Error();
        rep = (await r.json()) as Repeticion;
      } catch {
        this.aviso("No se pudo descargar la repetición.");
        return;
      }
    } else if (this.repeticion) rep = this.repeticion.rep;
    else {
      rep = {
        formato: 1,
        motor: 0,
        sala: "local",
        mesa: POOL_9FT.id,
        semilla: 0,
        inicio: this.inicio,
        jugadores: [...this.nombres],
        entradas: this.entradas,
        ganador: this.estado.winner,
        motivo: this.estado.loss,
      };
    }
    this.salirDeLaRed();
    this.modo = "repeticion";
    this.yo = 0;
    this.nombres = [rep.jugadores[0] || "Jugador 1", rep.jugadores[1] || "Jugador 2"];
    this.mundo = createWorld(POOL_9FT, rep.inicio);
    this.estado = bola8.newGame(0);
    this.repeticion = { rep, i: 0, reglas: this.estado, huellasOk: true };
    this.turnoVence = null;
    this.mostrarRepeticion(false);
    this.aviso("Repetición");
    this.redibujar();
    setTimeout(() => this.siguienteDeRepeticion(), 800);
  }

  private siguienteDeRepeticion(): void {
    const r = this.repeticion;
    if (!r || this.modo !== "repeticion") return;
    const e = r.rep.entradas[r.i++];
    if (!e) {
      this.fase = "fin";
      this.aviso(
        `Fin de la repetición.${r.huellasOk ? " Todas las huellas coinciden con el servidor." : ""}`,
      );
      this.mostrarRepeticion(true);
      this.redibujar();
      return;
    }
    if (e.tipo !== "tiro") {
      this.estado =
        e.tipo === "tiempo" ? bola8.timeoutFoul(this.estado) : bola8.forfeit(this.estado, e.jugador);
      this.aviso(`${this.nombres[e.jugador]}: ${e.tipo === "tiempo" ? "se acabó el tiempo" : "abandonó"}`);
      this.redibujar();
      setTimeout(() => this.siguienteDeRepeticion(), 1200);
      return;
    }
    if (e.blanca) bola8.placeCueBall(this.mundo, this.estado.ballInHand, e.blanca.x, e.blanca.y);
    this.angulo = e.tiro.angle;
    this.fase = "rival";
    this.redibujar(true);
    setTimeout(() => {
      const antes = bola8.ballsOnTable(this.mundo);
      const events = this.animar(e.tiro, () => {
        if (worldHash(this.mundo) !== e.hash) r.huellasOk = false;
        const v = bola8.judgeShot(this.estado, antes, events, e.cantar === null ? {} : { pocket: e.cantar });
        for (const id of v.respot) bola8.spotBall(this.mundo, id);
        this.estado = v.state;
        this.fase = "rival";
        this.aviso(
          `${this.nombres[e.jugador]}${v.fouls.length ? ` · falta: ${v.fouls.map((f) => FALTAS[f]).join(", ")}` : ""}`,
        );
        this.redibujar();
        setTimeout(() => this.siguienteDeRepeticion(), 700);
      });
    }, 600);
  }

  // ---------- Dibujo ----------

  /** Avanza la animación según el reloj real, aunque el navegador dibuje pocos cuadros. */
  private cuadro(): void {
    if (this.fase !== "animando" || !this.grabacion) return;
    const antes = this.reloj;
    this.reloj = (performance.now() - this.inicioAnimacion) / 1000;
    for (const { e, t } of this.eventos) {
      if (t <= antes || t > this.reloj) continue;
      if (e.kind === "ball") this.sonido.choque(e.speed);
      else if (e.kind === "cushion") this.sonido.banda(e.speed);
      else this.sonido.tronera();
    }
    this.vista.ponerBolas(this.grabacion.en(this.reloj));
    if (this.reloj >= this.grabacion.duracion) {
      this.grabacion = null;
      const fin = this.pendiente;
      this.pendiente = null;
      fin?.();
    }
  }

  private relojTurno(): void {
    const el = $("reloj");
    if (this.turnoVence === null || this.modo !== "red" || this.fase === "fin") {
      el.hidden = true;
      return;
    }
    const s = Math.max(0, Math.ceil((this.turnoVence - performance.now()) / 1000));
    el.hidden = false;
    el.textContent = `${s} s`;
    el.classList.toggle("poco", s <= 10);
  }

  private redibujar(verRival = false): void {
    if (!this.mundo) return;
    if (this.fase === "animando" && this.grabacion) return;
    this.vista.ponerBolas(this.mundo.balls);
    const c = this.blanca;
    const apuntando = this.miTurno || verRival;
    const visibles = this.mundo.balls.filter((b) => b.onTable && b.id !== 0);
    this.vista.dibujarGuia(c, apuntando && c.onTable ? trazarGuia(POOL_9FT, c, this.angulo, visibles) : null);
    this.vista.dibujarTaco(apuntando && c.onTable ? c : null, this.angulo, this.potencia);
    const on = bola8.ballsOnTable(this.mundo);
    const mano = this.miTurno && this.estado.ballInHand !== "no";
    this.vista.dibujarMarcas({
      zonaCabecera: mano && this.estado.ballInHand === "cabecera",
      blanca: mano ? c : null,
      blancaValida: mano ? true : null,
      troneras: this.miTurno && bola8.needsCall(this.estado, on),
      cantada: this.cantada,
    });
    this.marcador(on);
  }

  private marcador(on: number[]): void {
    for (const p of [0, 1] as const) {
      const el = $(`j${p}`);
      el.classList.toggle("activo", this.estado.turn === p && this.fase !== "fin");
      el.classList.toggle("caido", !this.conectados[p]);
      $(`j${p}-nombre`).textContent =
        this.modo === "red" && p === this.yo ? `${this.nombres[p]} (tú)` : this.nombres[p];
      const g = this.estado.groups[p];
      const bolas = $(`j${p}-bolas`);
      bolas.replaceChildren();
      const ids = g === null ? [] : g === "lisas" ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
      for (const id of ids) {
        const s = document.createElement("span");
        s.className = `ficha${id > 8 ? " raya" : ""}${on.includes(id) ? "" : " fuera"}`;
        s.style.setProperty("--c", BOLAS_POOL[(id > 8 ? id - 9 : id - 1) % 8]!);
        s.title = `Bola ${id}`;
        bolas.appendChild(s);
      }
      $(`j${p}-grupo`).textContent = g === null ? "Mesa abierta" : g === "lisas" ? "Lisas" : "Rayadas";
    }
  }

  private aviso(texto: string): void {
    $("aviso").textContent = texto;
  }
}
