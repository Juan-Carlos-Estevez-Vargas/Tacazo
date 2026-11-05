/**
 * Límite de tasa por cubeta de fichas: se rellena a `porSegundo` y aguanta
 * ráfagas de hasta `rafaga`. Cada mensaje gasta una ficha.
 */
export class Cubeta {
  private fichas: number;
  private ultima: number;

  constructor(
    private readonly porSegundo: number,
    private readonly rafaga: number,
    ahora: number,
  ) {
    this.fichas = rafaga;
    this.ultima = ahora;
  }

  tomar(ahora: number, costo = 1): boolean {
    this.fichas = Math.min(this.rafaga, this.fichas + ((ahora - this.ultima) / 1000) * this.porSegundo);
    this.ultima = ahora;
    if (this.fichas < costo) return false;
    this.fichas -= costo;
    return true;
  }
}

/** Límite por clave (por ejemplo, IP) en ventana fija. */
export class LimitePorClave {
  private readonly cuentas = new Map<string, { n: number; desde: number }>();

  constructor(
    private readonly maximo: number,
    private readonly ventanaMs: number,
  ) {}

  permitir(clave: string, ahora: number): boolean {
    const c = this.cuentas.get(clave);
    if (!c || ahora - c.desde >= this.ventanaMs) {
      this.cuentas.set(clave, { n: 1, desde: ahora });
      if (this.cuentas.size > 10_000) this.limpiar(ahora);
      return true;
    }
    c.n++;
    return c.n <= this.maximo;
  }

  private limpiar(ahora: number): void {
    for (const [k, c] of this.cuentas) if (ahora - c.desde >= this.ventanaMs) this.cuentas.delete(k);
  }
}
