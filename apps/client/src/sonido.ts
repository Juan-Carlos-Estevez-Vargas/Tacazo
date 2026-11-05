/**
 * Sonidos sintetizados con Web Audio: nada de archivos de terceros. Cada
 * golpe usa la velocidad del choque para el volumen y el tono.
 */
export class Sonido {
  private ctx: AudioContext | null = null;
  private ruido: AudioBuffer | null = null;
  activo = true;

  /** El navegador solo deja sonar después de un toque del usuario. */
  despertar(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      const n = this.ctx.sampleRate * 0.25;
      this.ruido = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = this.ruido.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private golpe(frecuencia: number, volumen: number, duracion: number, tipo: OscillatorType = "sine"): void {
    const ctx = this.ctx;
    if (!ctx || !this.activo || volumen <= 0.001) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gan = ctx.createGain();
    osc.type = tipo;
    osc.frequency.setValueAtTime(frecuencia, t);
    osc.frequency.exponentialRampToValueAtTime(frecuencia * 0.6, t + duracion);
    gan.gain.setValueAtTime(Math.min(1, volumen), t);
    gan.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
    osc.connect(gan).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duracion + 0.02);
  }

  private soplo(volumen: number, duracion: number, filtro: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.ruido || !this.activo || volumen <= 0.001) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.ruido;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = filtro;
    const gan = ctx.createGain();
    gan.gain.setValueAtTime(Math.min(1, volumen), t);
    gan.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
    src.connect(bp).connect(gan).connect(ctx.destination);
    src.start(t);
    src.stop(t + duracion);
  }

  taco(potencia: number): void {
    this.soplo(0.25 + potencia * 0.5, 0.05, 2500);
    this.golpe(900, 0.15 + potencia * 0.2, 0.04, "triangle");
  }

  choque(velocidad: number): void {
    const v = Math.min(1, velocidad / 4);
    this.golpe(2400 + v * 900, 0.08 + v * 0.5, 0.05, "sine");
    this.soplo(v * 0.25, 0.03, 4000);
  }

  banda(velocidad: number): void {
    const v = Math.min(1, velocidad / 4);
    this.golpe(140, 0.1 + v * 0.45, 0.12, "sine");
  }

  tronera(): void {
    this.golpe(420, 0.35, 0.08, "triangle");
    setTimeout(() => this.golpe(260, 0.3, 0.14, "sine"), 70);
    setTimeout(() => this.golpe(180, 0.22, 0.2, "sine"), 160);
  }

  turno(): void {
    this.golpe(660, 0.12, 0.09, "sine");
    setTimeout(() => this.golpe(880, 0.12, 0.12, "sine"), 90);
  }

  falta(): void {
    this.golpe(220, 0.18, 0.18, "square");
  }

  victoria(): void {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.golpe(f, 0.18, 0.25, "triangle"), i * 110));
  }
}
