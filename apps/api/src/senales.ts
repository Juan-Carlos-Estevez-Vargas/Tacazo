/**
 * Señales anti-trampas. No castigan solas: suman un puntaje y, si pasa el
 * umbral, el jugador entra a la cola de revisión manual con las repeticiones.
 *
 * Se calculan volviendo a jugar las repeticiones con el motor, así que solo
 * usan lo que el servidor ya validó. Los umbrales de producción viven en la
 * variable privada TACAZO_UMBRALES; los de aquí son de ejemplo para pruebas.
 */
import { reproducir, STEP, type Repeticion, type World } from "@tacazo/core";

export interface Umbrales {
  /** Tiros limpios mínimos para opinar sobre la puntería. */
  readonly minTiros: number;
  /** Error mediano de puntería (grados) por debajo del cual sospechamos. */
  readonly errorMedianoGrados: number;
  /** Intentos de corte difícil mínimos. */
  readonly minDificiles: number;
  /** Proporción de cortes difíciles metidos por encima de la cual sospechamos. */
  readonly tasaDificiles: number;
  /** Tiros con tiempo mínimos. */
  readonly minTiempos: number;
  /** Desviación del tiempo para pensar (ms) por debajo de la cual parece una máquina. */
  readonly desviacionTiempoMs: number;
  /** Puntaje desde el que se abre una revisión. */
  readonly puntajeRevision: number;
}

export const UMBRALES_EJEMPLO: Umbrales = {
  minTiros: 20,
  errorMedianoGrados: 0.05,
  minDificiles: 15,
  tasaDificiles: 0.8,
  minTiempos: 20,
  desviacionTiempoMs: 250,
  puntajeRevision: 2,
};

/** Lee los umbrales de la variable privada; lo que falte queda con el ejemplo. */
export function umbralesDe(json: string | undefined): Umbrales {
  if (!json) return UMBRALES_EJEMPLO;
  const extra = JSON.parse(json) as Record<string, unknown>;
  const out: Record<string, number> = { ...UMBRALES_EJEMPLO };
  for (const k of Object.keys(UMBRALES_EJEMPLO)) {
    const v = extra[k];
    if (v !== undefined) {
      if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`Umbral inválido: ${k}`);
      out[k] = v;
    }
  }
  return out as unknown as Umbrales;
}

/** Datos crudos de un jugador sumando varias partidas. */
export interface Muestras {
  /** Error de puntería (grados) en tiros limpios sin efecto lateral que metieron la bola. */
  readonly errores: number[];
  /** Intentos de corte difícil y cuántos entraron. */
  dificiles: number;
  dificilesMetidas: number;
  /** Tiempo para pensar en cada tiro (ms), descontando la animación del tiro anterior. */
  readonly tiempos: number[];
}

export const muestrasVacias = (): Muestras => ({
  errores: [],
  dificiles: 0,
  dificilesMetidas: 0,
  tiempos: [],
});

const GRADOS = 180 / Math.PI;
/** Coseno del corte por debajo del cual el tiro es difícil (más de 60°). */
const CORTE_DIFICIL = 0.5;

const difAngular = (a: number, b: number) => {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
};

/** Línea de bola fantasma de la blanca a la bola `b` hacia la tronera `p`. */
function fantasma(w: World, b: number, p: number): { angulo: number; corte: number } | null {
  const R = w.table.ballRadius;
  const cue = w.balls.find((x) => x.id === 0)!;
  const bola = w.balls.find((x) => x.id === b)!;
  const pocket = w.table.pockets[p]!;
  const tx = pocket.center.x - bola.x;
  const ty = pocket.center.y - bola.y;
  const tl = Math.hypot(tx, ty);
  const gx = bola.x - (2 * R * tx) / tl;
  const gy = bola.y - (2 * R * ty) / tl;
  const ax = gx - cue.x;
  const ay = gy - cue.y;
  const al = Math.hypot(ax, ay);
  if (al < 1e-6 || tl < 1e-6) return null;
  return { angulo: Math.atan2(ay, ax), corte: (ax * tx + ay * ty) / (al * tl) };
}

/** Suma a `m` las muestras del jugador `quien` (0 o 1) en una repetición. */
export function muestrear(rep: Repeticion, quien: 0 | 1, m: Muestras = muestrasVacias()): Muestras {
  let antes: { angulos: Map<string, { angulo: number; corte: number }> } | null = null;
  let pasosPrevios = 0;
  let tiroPrevio = false;
  const it = reproducir(rep, (w) => {
    // Para cada bola y tronera, la línea ideal desde donde está la blanca.
    const angulos = new Map<string, { angulo: number; corte: number }>();
    for (const b of w.balls) {
      if (b.id === 0 || !b.onTable) continue;
      w.table.pockets.forEach((_, p) => {
        const f = fantasma(w, b.id, p);
        if (f) angulos.set(`${b.id}/${p}`, f);
      });
    }
    antes = { angulos };
  });
  for (const paso of it) {
    const e = paso.entrada;
    if (e.tipo !== "tiro") {
      tiroPrevio = false;
      continue;
    }
    const previo = antes as { angulos: Map<string, { angulo: number; corte: number }> } | null;
    antes = null;
    if (e.jugador === quien && previo) {
      if (e.ms !== undefined) {
        const animacion = tiroPrevio ? pasosPrevios * STEP * 1000 : 0;
        m.tiempos.push(Math.max(0, e.ms - animacion));
      }
      const primera = paso.eventos.find((x) => x.kind === "ball" && (x.a === 0 || x.b === 0));
      const bola = primera?.kind === "ball" ? (primera.a === 0 ? primera.b : primera.a) : null;
      if (bola !== null) {
        const cayo = paso.eventos.find((x) => x.kind === "pocket" && x.ball === bola);
        // Intento: la tronera más fácil para esa bola desde donde estaba la blanca.
        let mejor: { angulo: number; corte: number } | null = null;
        for (const [k, f] of previo.angulos)
          if (k.startsWith(`${bola}/`) && (!mejor || f.corte > mejor.corte)) mejor = f;
        if (mejor && mejor.corte > 0 && mejor.corte < CORTE_DIFICIL) {
          m.dificiles++;
          if (cayo) m.dificilesMetidas++;
        }
        const limpio = Math.abs(e.tiro.side) < 0.05 && e.tiro.elevation < 5 && !e.blanca;
        if (cayo?.kind === "pocket" && limpio) {
          const f = previo.angulos.get(`${bola}/${cayo.pocket}`);
          if (f) m.errores.push(difAngular(e.tiro.angle, f.angulo) * GRADOS);
        }
      }
    }
    pasosPrevios = paso.pasos;
    tiroPrevio = true;
  }
  return m;
}

const mediana = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const i = s.length >> 1;
  return s.length % 2 ? s[i]! : (s[i - 1]! + s[i]!) / 2;
};

const desviacion = (xs: readonly number[]) => {
  const media = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - media) ** 2, 0) / xs.length);
};

export interface Senal {
  readonly clave: "punteria" | "cortes" | "tiempo";
  readonly valor: number;
  readonly umbral: number;
  readonly muestras: number;
}

export interface Evaluacion {
  readonly senales: readonly Senal[];
  readonly puntaje: number;
  readonly revisar: boolean;
}

/** Convierte las muestras en señales y decide si hace falta revisión. */
export function evaluar(m: Muestras, u: Umbrales): Evaluacion {
  const senales: Senal[] = [];
  if (m.errores.length >= u.minTiros) {
    const v = mediana(m.errores);
    if (v < u.errorMedianoGrados)
      senales.push({ clave: "punteria", valor: v, umbral: u.errorMedianoGrados, muestras: m.errores.length });
  }
  if (m.dificiles >= u.minDificiles) {
    const v = m.dificilesMetidas / m.dificiles;
    if (v > u.tasaDificiles)
      senales.push({ clave: "cortes", valor: v, umbral: u.tasaDificiles, muestras: m.dificiles });
  }
  if (m.tiempos.length >= u.minTiempos) {
    const v = desviacion(m.tiempos);
    if (v < u.desviacionTiempoMs)
      senales.push({ clave: "tiempo", valor: v, umbral: u.desviacionTiempoMs, muestras: m.tiempos.length });
  }
  const puntaje = senales.length;
  return { senales, puntaje, revisar: puntaje >= u.puntajeRevision };
}
