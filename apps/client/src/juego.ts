import {
  POOL_9FT,
  bola8,
  botMove,
  createRng,
  createWorld,
  rack8,
  simulateShot,
  type BotLevel,
  type Rng,
  type Shot,
  type SimEvent,
  type World,
} from "@tacazo/core";
import type { FederatedPointerEvent } from "pixi.js";
import { trazarGuia } from "./guia.js";
import { BOLAS_POOL } from "./marca.js";
import { VistaMesa, type PuntoMesa } from "./mesa.js";
import { Grabacion, eventosEnTiempo } from "./reproduccion.js";
import { Sonido } from "./sonido.js";

type Fase = "apuntando" | "animando" | "bot" | "fin";

const FALTAS: Record<bola8.Foul, string> = {
  "blanca-en-tronera": "la blanca cayó",
  "sin-contacto": "no tocó ninguna bola",
  "primera-bola-incorrecta": "tocó primero una bola que no era",
  "sin-banda": "ninguna bola tocó banda",
  "saque-ilegal": "saque ilegal",
};

const DERROTAS: Record<bola8.LossReason, string> = {
  "8-antes-de-tiempo": "metió la 8 antes de tiempo",
  "8-en-otra-tronera": "metió la 8 en otra tronera",
  "8-con-falta": "metió la 8 con falta",
  "8-sin-cantar": "metió la 8 sin cantar tronera",
};

const NOMBRES = ["Tú", "Bot"] as const;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function semilla(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]!;
}

/** Partida de práctica de bola 8 contra el bot, sin conexión. */
export class Juego {
  private mundo!: World;
  private estado!: bola8.Bola8State;
  private rng!: Rng;
  private fase: Fase = "apuntando";
  private angulo = 0;
  private potencia = 0;
  private efecto = { side: 0, top: 0 };
  private inclinacion = 0;
  private cantada: number | null = null;
  private moviendoBlanca = false;
  private grabacion: Grabacion | null = null;
  private eventos: { e: SimEvent; t: number }[] = [];
  private reloj = 0;
  private pendiente: (() => void) | null = null;
  private nivel: BotLevel = "medio";
  private readonly reducirMovimiento = matchMedia("(prefers-reduced-motion: reduce)").matches;

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
    this.vista.app.ticker.add((t) => this.cuadro(t.deltaMS / 1000));
    this.controles();
    this.nueva();
  }

  private get blanca() {
    return this.mundo.balls.find((b) => b.id === 0)!;
  }

  private get miTurno(): boolean {
    return this.estado.turn === 0 && this.fase === "apuntando";
  }

  nueva(): void {
    this.rng = createRng(semilla());
    this.mundo = createWorld(POOL_9FT, rack8(POOL_9FT, this.rng));
    this.estado = bola8.newGame(0);
    this.fase = "apuntando";
    this.cantada = null;
    this.angulo = 0;
    this.aviso("Tu saque. Puedes mover la blanca detrás de la línea.");
    this.redibujar();
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
    this.redibujar();
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
    $("nueva").addEventListener("click", () => this.nueva());
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
      this.redibujar();
    });
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
    this.ejecutar(shot, this.cantada === null ? {} : { pocket: this.cantada });
  }

  private ejecutar(shot: Shot, call: bola8.ShotCall): void {
    const antes = bola8.ballsOnTable(this.mundo);
    const primerPaso = this.mundo.step;
    const blanca = { x: this.blanca.x, y: this.blanca.y };
    const grab = new Grabacion(this.mundo);
    const res = simulateShot(this.mundo, shot, (w) => grab.grabar(w));
    const veredicto = bola8.judgeShot(this.estado, antes, res.events, call);
    this.grabacion = grab;
    this.eventos = eventosEnTiempo(res.events, primerPaso - 1);
    this.reloj = 0;
    this.fase = "animando";
    this.sonido.taco(shot.power);
    if (!this.reducirMovimiento) this.vista.polvoDeTiza(blanca, shot.angle);
    this.vista.dibujarGuia(blanca, null);
    this.vista.dibujarTaco(null, 0, 0);
    this.vista.dibujarMarcas({});
    this.pendiente = () => this.despues(veredicto);
  }

  private despues(v: bola8.ShotVerdict): void {
    for (const id of v.respot) bola8.spotBall(this.mundo, id);
    const quien = NOMBRES[this.estado.turn];
    this.estado = v.state;
    this.cantada = null;
    if (v.state.phase === "terminada") {
      this.fase = "fin";
      const gane = v.state.winner === 0;
      if (gane) this.sonido.victoria();
      else this.sonido.falta();
      const porque = v.state.loss ? ` ${quien} ${DERROTAS[v.state.loss]}.` : "";
      this.aviso(`${gane ? "¡Ganaste!" : "Ganó el bot."}${porque} Toca «Nueva partida» para jugar otra.`);
      this.redibujar();
      return;
    }
    if (v.state.ballInHand !== "no") this.dejarBlanca();
    let msg = "";
    if (v.fouls.length) {
      this.sonido.falta();
      msg = `Falta: ${v.fouls.map((f) => FALTAS[f]).join(", ")}. `;
    }
    if (v.respot.includes(8)) msg += "La 8 vuelve al punto de pie. ";
    const g = v.state.groups[0];
    if (g && !this.estado.groups.every((x) => x === null) && msg === "" && v.keepsTurn)
      msg = "¡Bien! Sigues tú. ";
    if (this.estado.turn === 0) {
      this.fase = "apuntando";
      this.sonido.turno();
      const mano = v.state.ballInHand !== "no" ? "Tienes bola en mano: arrastra la blanca. " : "";
      const ocho = bola8.needsCall(v.state, bola8.ballsOnTable(this.mundo))
        ? "Te toca la 8: canta tronera. "
        : "";
      this.aviso(`${msg}${mano}${ocho}${mano || ocho ? "" : "Tu turno."}`);
    } else {
      this.fase = "bot";
      this.aviso(`${msg}Turno del bot…`);
      setTimeout(() => this.turnoBot(), 900);
    }
    this.redibujar();
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
    if (this.fase !== "bot") return;
    const m = botMove(this.mundo, this.estado, this.nivel, this.rng);
    if (m.place) bola8.placeCueBall(this.mundo, this.estado.ballInHand, m.place.x, m.place.y);
    this.angulo = m.shot.angle;
    this.cantada = m.call.pocket ?? null;
    this.redibujar(true);
    setTimeout(() => this.ejecutar(m.shot, m.call), 700);
  }

  // ---------- Dibujo ----------

  private cuadro(dt: number): void {
    if (this.fase !== "animando" || !this.grabacion) return;
    const antes = this.reloj;
    this.reloj += dt;
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

  private redibujar(verBot = false): void {
    if (!this.mundo) return;
    if (this.fase === "animando" && this.grabacion) return;
    this.vista.ponerBolas(this.mundo.balls);
    const c = this.blanca;
    const apuntando = this.miTurno || verBot;
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
