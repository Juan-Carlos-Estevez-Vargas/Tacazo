import type { TableSpec } from "@tacazo/core";
import { Application, Container, Graphics, Text, type FederatedPointerEvent } from "pixi.js";
import { BOLAS_POOL, COLORES, FUENTES } from "./marca.js";
import type { Guia } from "./guia.js";

/** Grosor de la banda de madera alrededor del paño, en metros. */
const MARCO = 0.11;

export interface PuntoMesa {
  readonly x: number;
  readonly y: number;
}

/**
 * Dibuja la mesa con PixiJS. Trabaja en metros (origen abajo a la izquierda,
 * y hacia arriba) y convierte a píxeles. En pantallas verticales gira la mesa
 * para que la cabecera quede abajo.
 */
export class VistaMesa {
  readonly app = new Application();
  private readonly marco = new Container();
  private readonly raiz = new Container();
  private readonly capaBolas = new Container();
  private readonly guia = new Graphics();
  private readonly taco = new Graphics();
  private readonly marcas = new Graphics();
  private readonly particulas = new Graphics();
  private readonly bolas = new Map<number, Container>();
  private polvo: { x: number; y: number; vx: number; vy: number; vida: number }[] = [];
  /** Píxeles por metro. */
  private k = 400;

  constructor(private readonly mesa: TableSpec) {}

  async iniciar(contenedor: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: contenedor,
      antialias: true,
      background: COLORES.noche,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    this.app.canvas.setAttribute("aria-label", "Mesa de billar");
    contenedor.appendChild(this.app.canvas);
    this.app.stage.addChild(this.marco);
    this.marco.addChild(this.raiz);
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = this.app.screen;
    this.ajustar();
    // Pixi solo se redimensiona con la ventana; si cambia el contenedor (por
    // ejemplo, aparece un aviso arriba) hay que pedírselo.
    new ResizeObserver(() => {
      this.app.resize();
      this.ajustar();
    }).observe(contenedor);
    this.app.ticker.add((t) => this.animarPolvo(t.deltaMS / 1000));
  }

  /** Escala y gira la mesa para que quepa en la pantalla. */
  private ajustar(): void {
    const { width: sw, height: sh } = this.app.screen;
    if (sw === 0 || sh === 0) return;
    const vertical = sh > sw * 1.15;
    const anchoM = this.mesa.width + 2 * MARCO;
    const altoM = this.mesa.height + 2 * MARCO;
    const [w, h] = vertical ? [altoM, anchoM] : [anchoM, altoM];
    this.k = Math.min((sw - 8) / w, (sh - 8) / h);
    this.marco.position.set(sw / 2, sh / 2);
    this.marco.rotation = vertical ? -Math.PI / 2 : 0;
    this.raiz.pivot.set((this.mesa.width * this.k) / 2, (this.mesa.height * this.k) / 2);
    this.dibujarMesa();
  }

  private px(p: PuntoMesa): { x: number; y: number } {
    return { x: p.x * this.k, y: (this.mesa.height - p.y) * this.k };
  }

  /** Punto de la pantalla a metros de la mesa. */
  aMesa(e: FederatedPointerEvent): PuntoMesa {
    const local = this.raiz.toLocal(e.global);
    return { x: local.x / this.k, y: this.mesa.height - local.y / this.k };
  }

  private dibujarMesa(): void {
    this.raiz.removeChildren();
    const { width: W, height: H } = this.mesa;
    const k = this.k;
    const fondo = new Graphics();
    // Madera: noche con un filo de latón.
    fondo
      .roundRect(-MARCO * k, -MARCO * k, (W + 2 * MARCO) * k, (H + 2 * MARCO) * k, 0.05 * k)
      .fill("#2a1a10")
      .stroke({ width: 0.006 * k, color: COLORES.laton, alignment: 1 });
    fondo.rect(-0.035 * k, -0.035 * k, (W + 0.07) * k, (H + 0.07) * k).fill("#0a4434");
    fondo.rect(0, 0, W * k, H * k).fill(COLORES.pano);
    // Diamantes de la banda.
    for (let i = 1; i < 8; i++) {
      if (i === 4) continue;
      for (const y of [-MARCO / 2 - 0.01, H + MARCO / 2 + 0.01])
        fondo.circle(((W * i) / 8) * k, (H - y) * k, 0.008 * k).fill(COLORES.laton);
    }
    for (let i = 1; i < 4; i++)
      for (const x of [-MARCO / 2 - 0.01, W + MARCO / 2 + 0.01])
        fondo.circle(x * k, (H - (H * i) / 4) * k, 0.008 * k).fill(COLORES.laton);
    // Línea de cabecera y punto de pie.
    const cab = this.mesa.headStringX * k;
    fondo
      .moveTo(cab, 0)
      .lineTo(cab, H * k)
      .stroke({ width: 1, color: "#ffffff", alpha: 0.12 });
    const pie = this.px(this.mesa.footSpot);
    fondo.circle(pie.x, pie.y, 0.006 * k).fill({ color: "#ffffff", alpha: 0.25 });
    // Gomas.
    for (const s of this.mesa.cushions) {
      const a = this.px(s.a);
      const b = this.px(s.b);
      fondo
        .moveTo(a.x, a.y)
        .lineTo(b.x, b.y)
        .stroke({ width: 0.012 * k, color: "#0b4a39", cap: "round" });
    }
    // Las troneras se dibujan algo más chicas que su zona de captura, que
    // está corrida hacia fuera de la esquina.
    for (const p of this.mesa.pockets) {
      const c = this.px(p.center);
      fondo.circle(c.x, c.y, p.radius * 0.85 * k).fill("#050a08");
    }
    this.raiz.addChild(fondo, this.marcas, this.guia, this.capaBolas, this.particulas, this.taco);
    // Las bolas se vuelven a crear con el nuevo tamaño.
    for (const c of this.bolas.values()) c.destroy({ children: true });
    this.bolas.clear();
    this.alAjustar?.();
  }

  /** Se llama cuando cambia el tamaño, para volver a dibujar bolas y guía. */
  alAjustar: (() => void) | null = null;

  private crearBola(id: number): Container {
    const R = this.mesa.ballRadius * this.k;
    const c = new Container();
    const g = new Graphics();
    if (id === 0) {
      g.circle(0, 0, R).fill(COLORES.marfil);
      // El punto de tiza del logo.
      g.circle(-R * 0.35, R * 0.35, R * 0.16).fill(COLORES.tiza);
      c.addChild(g);
    } else {
      const raya = id > 8;
      const color = BOLAS_POOL[(raya ? id - 9 : id - 1) % 8]!;
      g.circle(0, 0, R).fill(raya ? COLORES.marfil : color);
      if (raya) {
        const banda = new Graphics().rect(-R, -R * 0.55, 2 * R, R * 1.1).fill(color);
        const mascara = new Graphics().circle(0, 0, R).fill("#ffffff");
        banda.mask = mascara;
        c.addChild(g, mascara, banda);
      } else c.addChild(g);
      const placa = new Graphics().circle(0, 0, R * 0.48).fill(COLORES.marfil);
      const num = new Text({
        text: String(id),
        style: { fontFamily: FUENTES.numeros, fontSize: R * 0.62, fontWeight: "700", fill: "#111111" },
      });
      num.anchor.set(0.5);
      c.addChild(placa, num);
    }
    const brillo = new Graphics()
      .circle(-R * 0.35, -R * 0.4, R * 0.28)
      .fill({ color: "#ffffff", alpha: 0.35 });
    c.addChild(brillo);
    this.capaBolas.addChild(c);
    this.bolas.set(id, c);
    return c;
  }

  /** Coloca las bolas. Las que no están en la mesa se esconden. */
  ponerBolas(bolas: readonly { id: number; x: number; y: number; onTable: boolean }[]): void {
    for (const b of bolas) {
      const c = this.bolas.get(b.id) ?? this.crearBola(b.id);
      c.visible = b.onTable;
      const p = this.px(b);
      c.position.set(p.x, p.y);
      // Las bolas no giran con la mesa: los números se leen siempre derechos.
      c.rotation = -this.marco.rotation;
    }
  }

  /** Línea de apuntado, bola fantasma y salidas. */
  dibujarGuia(blanca: PuntoMesa, g: Guia | null): void {
    this.guia.clear();
    if (!g) return;
    const k = this.k;
    const R = this.mesa.ballRadius * k;
    const a = this.px(blanca);
    const f = this.px(g.fantasma);
    this.guia.moveTo(a.x, a.y).lineTo(f.x, f.y).stroke({ width: 2, color: COLORES.marfil, alpha: 0.8 });
    this.guia.circle(f.x, f.y, R).stroke({ width: 2, color: COLORES.marfil, alpha: 0.8 });
    const largo = 0.25 * k;
    if (g.salidaBola) {
      const o = { x: f.x + g.salidaBola.x * 2 * R, y: f.y - g.salidaBola.y * 2 * R };
      this.guia
        .moveTo(o.x, o.y)
        .lineTo(o.x + g.salidaBola.x * largo, o.y - g.salidaBola.y * largo)
        .stroke({ width: 2, color: COLORES.tizaOscuro, alpha: 0.9 });
    }
    if (g.salidaBlanca) {
      this.guia
        .moveTo(f.x, f.y)
        .lineTo(f.x + g.salidaBlanca.x * largo * 0.6, f.y - g.salidaBlanca.y * largo * 0.6)
        .stroke({ width: 1.5, color: COLORES.marfil, alpha: 0.45 });
    }
  }

  /** El taco detrás de la blanca, más atrás cuanta más potencia. */
  dibujarTaco(blanca: PuntoMesa | null, angulo: number, potencia: number): void {
    this.taco.clear();
    if (!blanca) return;
    const k = this.k;
    const p = this.px(blanca);
    const dx = Math.cos(angulo);
    const dy = -Math.sin(angulo);
    const sep = (this.mesa.ballRadius + 0.01 + potencia * 0.22) * k;
    const largo = 1.3 * k;
    const ax = p.x - dx * sep;
    const ay = p.y - dy * sep;
    const bx = ax - dx * largo;
    const by = ay - dy * largo;
    this.taco
      .moveTo(ax, ay)
      .lineTo(bx, by)
      .stroke({ width: 0.016 * k, color: "#c9a26a", cap: "round" });
    this.taco
      .moveTo(ax - dx * largo * 0.62, ay - dy * largo * 0.62)
      .lineTo(bx, by)
      .stroke({ width: 0.022 * k, color: "#3a2416", cap: "round" });
    this.taco
      .moveTo(ax, ay)
      .lineTo(ax - dx * 0.012 * k, ay - dy * 0.012 * k)
      .stroke({ width: 0.016 * k, color: COLORES.tiza });
  }

  /**
   * Marcas sobre la mesa: dónde se puede dejar la blanca, la tronera cantada
   * y las troneras que se pueden cantar.
   */
  dibujarMarcas(opc: {
    zonaCabecera?: boolean;
    blancaValida?: boolean | null;
    blanca?: PuntoMesa | null;
    troneras?: boolean;
    cantada?: number | null;
  }): void {
    const m = this.marcas;
    m.clear();
    const k = this.k;
    const { height: H, ballRadius: R } = this.mesa;
    if (opc.zonaCabecera)
      m.rect(0, 0, this.mesa.headStringX * k, H * k).fill({ color: "#ffffff", alpha: 0.05 });
    if (opc.blanca && opc.blancaValida !== null && opc.blancaValida !== undefined) {
      const p = this.px(opc.blanca);
      m.circle(p.x, p.y, R * k * 1.45).stroke({
        width: 2,
        color: opc.blancaValida ? COLORES.tizaOscuro : "#e05252",
      });
    }
    if (opc.troneras || opc.cantada !== null) {
      this.mesa.pockets.forEach((p, i) => {
        const c = this.px(p.center);
        if (i === opc.cantada)
          m.circle(c.x, c.y, p.radius * k * 1.1).stroke({ width: 3, color: COLORES.latonOscuro });
        else if (opc.troneras)
          m.circle(c.x, c.y, p.radius * k * 1.1).stroke({
            width: 2,
            color: COLORES.latonOscuro,
            alpha: 0.45,
          });
      });
    }
  }

  /** Polvo de tiza al golpear. */
  polvoDeTiza(en: PuntoMesa, angulo: number): void {
    const p = this.px(en);
    for (let i = 0; i < 14; i++) {
      const a = -angulo + Math.PI + (Math.random() - 0.5) * 1.6;
      const v = 40 + Math.random() * 90;
      this.polvo.push({
        x: p.x,
        y: p.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        vida: 0.35 + Math.random() * 0.2,
      });
    }
  }

  private animarPolvo(dt: number): void {
    this.particulas.clear();
    if (!this.polvo.length) return;
    this.polvo = this.polvo.filter((q) => (q.vida -= dt) > 0);
    for (const q of this.polvo) {
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= 0.9;
      q.vy *= 0.9;
      this.particulas
        .circle(q.x, q.y, 1.6)
        .fill({ color: COLORES.tizaOscuro, alpha: Math.min(1, q.vida * 3) });
    }
  }

  /** Índice de la tronera más cercana al punto, si está a menos de 12 cm. */
  troneraCerca(p: PuntoMesa): number | null {
    let mejor: number | null = null;
    let dist = 0.12 * 0.12;
    this.mesa.pockets.forEach((t, i) => {
      const d = (t.center.x - p.x) ** 2 + (t.center.y - p.y) ** 2;
      if (d < dist) {
        dist = d;
        mejor = i;
      }
    });
    return mejor;
  }
}
