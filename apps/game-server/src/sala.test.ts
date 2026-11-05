import {
  POOL_9FT,
  botMove,
  createRng,
  createWorld,
  verificarRepeticion,
  type MensajeServidor,
  type Shot,
  type Snapshot,
} from "@tacazo/core";
import { describe, expect, it } from "vitest";
import { ESPERA_MS, MAX_RECHAZOS, Sala, TURNO_MS, type Conexion, type Reloj } from "./sala.js";

class RelojFalso implements Reloj {
  t = 1_000_000;
  private tareas: { en: number; fn: () => void; vivo: boolean }[] = [];
  ahora = () => this.t;
  programar(ms: number, fn: () => void) {
    const tarea = { en: this.t + ms, fn, vivo: true };
    this.tareas.push(tarea);
    return () => {
      tarea.vivo = false;
    };
  }
  avanzar(ms: number) {
    const fin = this.t + ms;
    for (;;) {
      const prox = this.tareas.filter((x) => x.vivo && x.en <= fin).sort((a, b) => a.en - b.en)[0];
      if (!prox) break;
      this.t = prox.en;
      prox.vivo = false;
      prox.fn();
    }
    this.t = fin;
  }
}

class ConexionFalsa implements Conexion {
  recibidos: MensajeServidor[] = [];
  cerrada: { codigo: number; motivo: string } | null = null;
  enviar(m: MensajeServidor) {
    this.recibidos.push(m);
  }
  cerrar(codigo: number, motivo: string) {
    this.cerrada = { codigo, motivo };
  }
  ultimo<T extends MensajeServidor["t"]>(t: T) {
    return this.recibidos.filter((m) => m.t === t).at(-1) as Extract<MensajeServidor, { t: T }> | undefined;
  }
}

const tiro = (s: Partial<Shot> = {}): Shot => ({ angle: 0, power: 1, side: 0, top: 0, elevation: 0, ...s });

function preparar() {
  const reloj = new RelojFalso();
  const sala = new Sala("abc", 7, reloj);
  sala.sentar(0, "Ana");
  sala.sentar(1, "Beto");
  const a = new ConexionFalsa();
  const b = new ConexionFalsa();
  sala.conectar(0, a);
  sala.conectar(1, b);
  return { reloj, sala, a, b };
}

describe("sala", () => {
  it("empieza cuando los dos están conectados y manda el estado inicial", () => {
    const reloj = new RelojFalso();
    const sala = new Sala("abc", 7, reloj);
    sala.sentar(0, "Ana");
    const a = new ConexionFalsa();
    sala.conectar(0, a);
    expect(a.ultimo("bienvenida")?.estado.fase).toBe("esperando");
    expect(sala.sentar(0, "Otro")).toBe(false);
    sala.sentar(1, "Beto");
    sala.conectar(1, new ConexionFalsa());
    const e = a.ultimo("estado")!.estado;
    expect(e.fase).toBe("jugando");
    expect(e.jugadores.map((j) => j.nombre)).toEqual(["Ana", "Beto"]);
    expect(e.turnoRestante).toBe(TURNO_MS);
    expect(e.bolas).toHaveLength(16);
  });

  it("simula el tiro y manda el mismo resultado y la misma huella a los dos", () => {
    const { sala, a, b } = preparar();
    sala.recibir(0, { t: "tirar", seq: 1, tiro: tiro() }, a);
    const ra = a.ultimo("resultado")!;
    const rb = b.ultimo("resultado")!;
    expect(ra).toEqual(rb);
    expect(ra.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(ra.estado.reglas.phase).toBe("juego");
  });

  it("el cliente reproduce el tiro y obtiene la misma huella", async () => {
    const { sala, a } = preparar();
    const antes = a.ultimo("bienvenida")!.estado;
    sala.recibir(0, { t: "tirar", seq: 1, tiro: tiro({ side: 0.2 }) }, a);
    const r = a.ultimo("resultado")!;
    const { simulateShot, worldHash } = await import("@tacazo/core");
    const w = createWorld(POOL_9FT, antes.bolas);
    w.step = antes.paso;
    simulateShot(w, r.tiro);
    expect(worldHash(w)).toBe(r.hash);
  });

  it("rechaza tiros fuera de turno y secuencias repetidas", () => {
    const { sala, a, b } = preparar();
    sala.recibir(1, { t: "tirar", seq: 1, tiro: tiro() }, b);
    expect(b.ultimo("rechazo")?.motivo).toBe("No es tu turno");
    sala.recibir(0, { t: "tirar", seq: 2, tiro: tiro() }, a);
    expect(a.ultimo("rechazo")?.motivo).toMatch(/Secuencia/);
    sala.recibir(0, { t: "tirar", seq: 1, tiro: tiro({ power: 0.05 }) }, a);
    expect(a.ultimo("resultado")?.seq).toBe(1);
    const turno = a.ultimo("resultado")!.estado.reglas.turn;
    const quien = turno === 0 ? a : b;
    sala.recibir(turno, { t: "tirar", seq: 1, tiro: tiro() }, quien);
    if (turno === 0) expect(quien.ultimo("rechazo")?.motivo).toMatch(/Secuencia/);
  });

  it("no deja poner la blanca fuera de la cabecera en el saque", () => {
    const { sala, a } = preparar();
    sala.recibir(0, { t: "tirar", seq: 1, tiro: tiro(), blanca: { x: 1.5, y: 0.6 } }, a);
    expect(a.ultimo("rechazo")?.motivo).toMatch(/blanca/);
    sala.recibir(0, { t: "tirar", seq: 1, tiro: tiro(), blanca: { x: 0.4, y: 0.6 } }, a);
    expect(a.ultimo("resultado")?.blanca).toEqual({ x: 0.4, y: 0.6 });
  });

  it("ignora mensajes de una conexión que no es la de la silla", () => {
    const { sala, a } = preparar();
    const intrusa = new ConexionFalsa();
    sala.recibir(0, { t: "tirar", seq: 1, tiro: tiro() }, intrusa);
    expect(intrusa.recibidos).toEqual([]);
    expect(a.ultimo("resultado")).toBeUndefined();
  });

  it("reenvía el apuntado al rival con límite de tasa", () => {
    const { sala, a, b } = preparar();
    for (let i = 0; i < 30; i++) sala.recibir(0, { t: "apuntar", angulo: i / 10 }, a);
    expect(b.recibidos.filter((m) => m.t === "apunta")).toHaveLength(10);
    sala.recibir(1, { t: "apuntar", angulo: 1 }, b);
    expect(a.recibidos.filter((m) => m.t === "apunta")).toHaveLength(0);
  });

  it("cierra la conexión tras demasiados rechazos", () => {
    const { sala, b } = preparar();
    for (let i = 0; i <= MAX_RECHAZOS; i++) sala.recibir(1, { t: "tirar", seq: 1, tiro: tiro() }, b);
    expect(b.cerrada?.codigo).toBe(4008);
    expect(b.ultimo("error")?.codigo).toBe("abuso");
  });

  it("si se acaba el turno, pasa al rival", () => {
    const { reloj, a } = preparar();
    reloj.avanzar(TURNO_MS - 1);
    expect(a.ultimo("tiempo")).toBeUndefined();
    reloj.avanzar(1);
    const m = a.ultimo("tiempo")!;
    expect(m.jugador).toBe(0);
    expect(m.estado.reglas.turn).toBe(1);
    expect(m.estado.turnoRestante).toBe(TURNO_MS);
  });

  it("espera 60 s al jugador caído y si vuelve sigue la partida", () => {
    const { reloj, sala, a, b } = preparar();
    sala.desconectar(1, b);
    expect(a.ultimo("estado")!.estado.jugadores[1]!.conectado).toBe(false);
    reloj.avanzar(ESPERA_MS - 1000);
    const b2 = new ConexionFalsa();
    sala.conectar(1, b2);
    reloj.avanzar(ESPERA_MS);
    expect(b2.ultimo("bienvenida")?.jugador).toBe(1);
    expect(sala.snapshot().fase).toBe("jugando");
  });

  it("si no vuelve en 60 s, pierde por abandono", () => {
    const { reloj, sala, a, b } = preparar();
    sala.desconectar(1, b);
    reloj.avanzar(ESPERA_MS);
    const e = a.ultimo("estado")!.estado;
    expect(e.fase).toBe("terminada");
    expect(e.reglas).toMatchObject({ winner: 0, loss: "abandono" });
    expect(e.turnoRestante).toBeNull();
  });

  it("una conexión nueva del mismo jugador cierra la anterior", () => {
    const { sala, a } = preparar();
    const a2 = new ConexionFalsa();
    sala.conectar(0, a2);
    expect(a.cerrada?.codigo).toBe(4000);
    sala.desconectar(0, a);
    expect(sala.snapshot().jugadores[0]!.conectado).toBe(true);
  });

  it("una partida entera entre bots se puede repetir con las mismas huellas", () => {
    const { reloj, sala, a, b } = preparar();
    const rng = createRng(3);
    const seq = [0, 0];
    let estado: Snapshot = a.ultimo("estado")!.estado;
    for (let n = 0; n < 150 && estado.fase === "jugando"; n++) {
      const yo = estado.reglas.turn;
      const w = createWorld(POOL_9FT, estado.bolas);
      for (const bo of w.balls) bo.onTable = estado.bolas.find((x) => x.id === bo.id)!.onTable;
      const mov = botMove(w, estado.reglas, "medio", rng);
      seq[yo]!++;
      sala.recibir(
        yo,
        {
          t: "tirar",
          seq: seq[yo]!,
          tiro: mov.shot,
          ...(mov.call.pocket === undefined ? {} : { cantar: mov.call.pocket }),
          ...(mov.place ? { blanca: mov.place } : {}),
        },
        yo === 0 ? a : b,
      );
      const r = (yo === 0 ? a : b).recibidos.at(-1)!;
      expect(r.t, JSON.stringify(r)).toBe("resultado");
      estado = (r as Extract<MensajeServidor, { t: "resultado" }>).estado;
      reloj.avanzar(1000);
    }
    expect(estado.fase).toBe("terminada");
    const rep = JSON.parse(JSON.stringify(sala.repeticion()));
    expect(verificarRepeticion(rep)).toEqual({ ok: true, fallos: [] });
    // Una repetición alterada no pasa.
    const mala = structuredClone(rep);
    const t = mala.entradas.find((e: { tipo: string }) => e.tipo === "tiro");
    t.tiro.power = t.tiro.power * 0.9;
    expect(verificarRepeticion(mala).ok).toBe(false);
  }, 60_000);
});
