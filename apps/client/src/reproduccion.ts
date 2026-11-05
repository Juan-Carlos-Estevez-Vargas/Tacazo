import { STEP, type SimEvent, type World } from "@tacazo/core";

/**
 * Graba un tiro paso a paso para reproducirlo a tiempo real. La física corre
 * entera al tirar (en el servidor será igual: se simula y se manda el
 * resultado) y aquí solo se interpola entre pasos para dibujar.
 */
export class Grabacion {
  private readonly cuadros: Float64Array[] = [];
  private readonly enMesa: Uint8Array[] = [];
  readonly ids: readonly number[];

  constructor(w: World) {
    this.ids = w.balls.map((b) => b.id);
    this.grabar(w);
  }

  grabar(w: World): void {
    const f = new Float64Array(w.balls.length * 2);
    const m = new Uint8Array(w.balls.length);
    w.balls.forEach((b, i) => {
      f[i * 2] = b.x;
      f[i * 2 + 1] = b.y;
      m[i] = b.onTable ? 1 : 0;
    });
    this.cuadros.push(f);
    this.enMesa.push(m);
  }

  /** Duración en segundos. */
  get duracion(): number {
    return (this.cuadros.length - 1) * STEP;
  }

  /** Posiciones en el instante t (segundos desde el golpe). */
  en(t: number): { id: number; x: number; y: number; onTable: boolean }[] {
    const paso = Math.max(0, Math.min(this.cuadros.length - 1, t / STEP));
    const i = Math.floor(paso);
    const j = Math.min(i + 1, this.cuadros.length - 1);
    const u = paso - i;
    const a = this.cuadros[i]!;
    const b = this.cuadros[j]!;
    const m = this.enMesa[j]!;
    return this.ids.map((id, n) => ({
      id,
      x: a[n * 2]! + (b[n * 2]! - a[n * 2]!) * u,
      y: a[n * 2 + 1]! + (b[n * 2 + 1]! - a[n * 2 + 1]!) * u,
      onTable: m[n] === 1,
    }));
  }
}

/** Eventos con su instante en segundos desde el golpe. */
export function eventosEnTiempo(events: readonly SimEvent[], primerPaso: number) {
  return events.map((e) => ({ e, t: (e.step - primerPaso) * STEP }));
}
