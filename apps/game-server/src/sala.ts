import {
  ENGINE_VERSION,
  POOL_9FT,
  bola8,
  createRng,
  createWorld,
  rack8,
  simulateShot,
  worldHash,
  type BallInit,
  type EntradaRepeticion,
  type MensajeCliente,
  type MensajeServidor,
  type Repeticion,
  type Snapshot,
  type World,
} from "@tacazo/core";
import { Cubeta } from "./limite.js";

/** Reloj inyectable: en producción es el real; en las pruebas, uno falso. */
export interface Reloj {
  ahora(): number;
  /** Programa `fn` dentro de `ms`; devuelve cómo cancelarlo. */
  programar(ms: number, fn: () => void): () => void;
}

export const relojReal: Reloj = {
  ahora: () => Date.now(),
  programar(ms, fn) {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  },
};

export interface Conexion {
  enviar(m: MensajeServidor): void;
  cerrar(codigo: number, motivo: string): void;
}

export const TURNO_MS = 30_000;
export const ESPERA_MS = 60_000;
/** Mensajes rechazados que se toleran antes de cerrar la conexión. */
export const MAX_RECHAZOS = 20;

type Jugador = 0 | 1;

interface Silla {
  readonly nombre: string;
  conexion: Conexion | null;
  /** Último número de secuencia aceptado. */
  seq: number;
  rechazos: number;
  readonly apuntar: Cubeta;
  cancelarEspera: (() => void) | null;
}

/**
 * Sala de bola 8 para dos jugadores. El servidor es la autoridad: recibe la
 * intención del tiro, lo simula con el mismo motor que el cliente, aplica las
 * reglas y manda el resultado con la huella del estado a los dos.
 */
export class Sala {
  private readonly mundo: World;
  private reglas: bola8.Bola8State = bola8.newGame(0);
  private fase: Snapshot["fase"] = "esperando";
  private readonly sillas: [Silla | null, Silla | null] = [null, null];
  private readonly inicio: BallInit[];
  private readonly entradas: EntradaRepeticion[] = [];
  private turnoVence: number | null = null;
  private cancelarTurno: (() => void) | null = null;
  readonly creada: number;
  terminadaEn: number | null = null;

  constructor(
    readonly id: string,
    readonly semilla: number,
    private readonly reloj: Reloj = relojReal,
  ) {
    this.inicio = rack8(POOL_9FT, createRng(semilla));
    this.mundo = createWorld(POOL_9FT, this.inicio);
    this.creada = reloj.ahora();
  }

  get estadoFase(): Snapshot["fase"] {
    return this.fase;
  }

  /** Reserva una silla (al emitir el token). Devuelve false si ya está ocupada. */
  sentar(jugador: Jugador, nombre: string): boolean {
    if (this.sillas[jugador]) return false;
    this.sillas[jugador] = {
      nombre,
      conexion: null,
      seq: 0,
      rechazos: 0,
      apuntar: new Cubeta(10, 10, this.reloj.ahora()),
      cancelarEspera: null,
    };
    return true;
  }

  libre(jugador: Jugador): boolean {
    return this.sillas[jugador] === null;
  }

  conectar(jugador: Jugador, c: Conexion): void {
    const s = this.sillas[jugador];
    if (!s) {
      c.cerrar(4004, "No tienes silla en esta sala");
      return;
    }
    if (s.conexion && s.conexion !== c) s.conexion.cerrar(4000, "Te conectaste desde otro lugar");
    s.conexion = c;
    s.cancelarEspera?.();
    s.cancelarEspera = null;
    c.enviar({ t: "bienvenida", jugador, estado: this.snapshot() });
    if (this.fase === "esperando" && this.sillas.every((x) => x?.conexion)) {
      this.fase = "jugando";
      this.iniciarTurno();
    }
    this.difundirEstado();
  }

  desconectar(jugador: Jugador, c: Conexion): void {
    const s = this.sillas[jugador];
    if (!s || s.conexion !== c) return;
    s.conexion = null;
    if (this.fase === "jugando") {
      s.cancelarEspera = this.reloj.programar(ESPERA_MS, () => this.abandono(jugador));
    }
    this.difundirEstado();
  }

  recibir(jugador: Jugador, m: MensajeCliente, c: Conexion): void {
    const s = this.sillas[jugador];
    if (!s || s.conexion !== c) return;
    if (m.t === "apuntar") {
      if (this.fase !== "jugando" || this.reglas.turn !== jugador) return;
      if (!s.apuntar.tomar(this.reloj.ahora())) return;
      this.otro(jugador)?.conexion?.enviar({ t: "apunta", angulo: m.angulo });
      return;
    }
    if (m.t === "tirar") {
      const motivo = this.tirar(jugador, s, m);
      if (motivo) this.rechazar(s, motivo);
      return;
    }
    this.rechazar(s, "Ya saludaste");
  }

  private rechazar(s: Silla, motivo: string): void {
    s.rechazos++;
    s.conexion?.enviar({ t: "rechazo", motivo });
    if (s.rechazos > MAX_RECHAZOS) {
      s.conexion?.enviar({ t: "error", codigo: "abuso", mensaje: "Demasiados mensajes inválidos" });
      s.conexion?.cerrar(4008, "Demasiados mensajes inválidos");
    }
  }

  /** Aplica un tiro. Devuelve el motivo del rechazo o null si se aceptó. */
  private tirar(jugador: Jugador, s: Silla, m: Extract<MensajeCliente, { t: "tirar" }>): string | null {
    if (this.fase !== "jugando") return "La partida no está en juego";
    if (this.reglas.turn !== jugador) return "No es tu turno";
    if (m.seq !== s.seq + 1) return "Secuencia repetida o fuera de orden";
    const hand = this.reglas.ballInHand;
    const cue = this.mundo.balls.find((b) => b.id === 0)!;
    if (m.blanca) {
      if (hand === "no") return "No tienes bola en mano";
      if (!bola8.canPlaceCueBall(this.mundo, hand, m.blanca.x, m.blanca.y))
        return "No se puede dejar la blanca ahí";
    } else if (!cue.onTable) return "Tienes que dejar la blanca en la mesa";
    else if (hand === "cabecera" && cue.x > POOL_9FT.headStringX) return "La blanca va detrás de la línea";
    const on = bola8.ballsOnTable(this.mundo);
    if (bola8.needsCall(this.reglas, on) && m.cantar === undefined) return "Canta la tronera de la 8";
    if (m.cantar !== undefined && m.cantar >= POOL_9FT.pockets.length) return "Esa tronera no existe";

    // Aceptado.
    s.seq = m.seq;
    if (m.blanca) bola8.placeCueBall(this.mundo, hand, m.blanca.x, m.blanca.y);
    const antes = bola8.ballsOnTable(this.mundo);
    const res = simulateShot(this.mundo, m.tiro);
    const call = m.cantar === undefined ? {} : { pocket: m.cantar };
    const v = bola8.judgeShot(this.reglas, antes, res.events, call);
    const hash = worldHash(this.mundo);
    for (const id of v.respot) bola8.spotBall(this.mundo, id);
    this.reglas = v.state;
    this.entradas.push({
      tipo: "tiro",
      jugador,
      seq: m.seq,
      tiro: m.tiro,
      cantar: m.cantar ?? null,
      blanca: m.blanca ?? null,
      hash,
    });
    if (v.state.phase === "terminada") this.terminar();
    else this.iniciarTurno();
    const resultado: MensajeServidor = {
      t: "resultado",
      jugador,
      seq: m.seq,
      tiro: m.tiro,
      cantar: m.cantar ?? null,
      blanca: m.blanca ?? null,
      veredicto: { fouls: v.fouls, keepsTurn: v.keepsTurn, respot: v.respot, pocketed: v.pocketed },
      hash,
      estado: this.snapshot(),
    };
    this.difundir(resultado);
    return null;
  }

  private iniciarTurno(): void {
    this.cancelarTurno?.();
    this.turnoVence = this.reloj.ahora() + TURNO_MS;
    this.cancelarTurno = this.reloj.programar(TURNO_MS, () => this.seAcaboElTiempo());
  }

  private seAcaboElTiempo(): void {
    if (this.fase !== "jugando") return;
    const jugador = this.reglas.turn;
    this.reglas = bola8.timeoutFoul(this.reglas);
    this.entradas.push({ tipo: "tiempo", jugador });
    this.iniciarTurno();
    this.difundir({ t: "tiempo", jugador, estado: this.snapshot() });
  }

  private abandono(jugador: Jugador): void {
    if (this.fase !== "jugando") return;
    this.reglas = bola8.forfeit(this.reglas, jugador);
    this.entradas.push({ tipo: "abandono", jugador });
    this.terminar();
    this.difundirEstado();
  }

  private terminar(): void {
    this.fase = "terminada";
    this.terminadaEn = this.reloj.ahora();
    this.cancelarTurno?.();
    this.cancelarTurno = null;
    this.turnoVence = null;
    for (const s of this.sillas) {
      s?.cancelarEspera?.();
      if (s) s.cancelarEspera = null;
    }
  }

  private otro(j: Jugador): Silla | null {
    return this.sillas[j === 0 ? 1 : 0];
  }

  private difundir(m: MensajeServidor): void {
    for (const s of this.sillas) s?.conexion?.enviar(m);
  }

  private difundirEstado(): void {
    this.difundir({ t: "estado", estado: this.snapshot() });
  }

  snapshot(): Snapshot {
    return {
      sala: this.id,
      fase: this.fase,
      reglas: this.reglas,
      bolas: this.mundo.balls.map((b) => ({ id: b.id, x: b.x, y: b.y, onTable: b.onTable })),
      paso: this.mundo.step,
      jugadores: this.sillas.map((s) => ({ nombre: s?.nombre ?? "", conectado: !!s?.conexion })),
      secuencias: [this.sillas[0]?.seq ?? 0, this.sillas[1]?.seq ?? 0],
      turnoRestante: this.turnoVence === null ? null : Math.max(0, this.turnoVence - this.reloj.ahora()),
    };
  }

  repeticion(): Repeticion {
    return {
      formato: 1,
      motor: ENGINE_VERSION,
      sala: this.id,
      mesa: POOL_9FT.id,
      semilla: this.semilla,
      inicio: this.inicio,
      jugadores: this.sillas.map((s) => s?.nombre ?? ""),
      entradas: this.entradas,
      ganador: this.reglas.winner,
      motivo: this.reglas.loss,
    };
  }
}
