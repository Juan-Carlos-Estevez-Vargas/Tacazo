import { vec, type Vec2 } from "./vec.js";

/**
 * Una mesa se describe como datos: el motor no sabe si es pool, carambola o
 * snooker. Un modo nuevo es una mesa + un juego de bolas + sus reglas.
 * Todas las medidas en metros, con el origen en la esquina inferior izquierda
 * del área de juego (la nariz de las gomas). La cabecera está a la izquierda.
 */
export interface TableSpec {
  readonly id: string;
  /** Área de juego entre las narices de las gomas. */
  readonly width: number;
  readonly height: number;
  /** Radio de las bolas de esta mesa. */
  readonly ballRadius: number;
  readonly pockets: readonly Pocket[];
  /** Gomas como segmentos; los extremos también chocan (puntas de tronera). */
  readonly cushions: readonly Segment[];
  /** Línea de cabecera (x): detrás de ella se coloca la blanca en el saque. */
  readonly headStringX: number;
  /** Punto de pie, donde va la bola de punta del triángulo. */
  readonly footSpot: Vec2;
  readonly cloth: ClothSpec;
}

export interface Pocket {
  readonly center: Vec2;
  /** Radio de captura: si el centro de la bola entra aquí, cae. */
  readonly radius: number;
}

export interface Segment {
  readonly a: Vec2;
  readonly b: Vec2;
}

/** Constantes físicas del paño, las bolas y las gomas de una mesa. */
export interface ClothSpec {
  /** Rozamiento mientras la bola desliza sobre el paño. */
  readonly slideFriction: number;
  /** Resistencia a la rodadura. */
  readonly rollFriction: number;
  /** Frenado del giro sobre el eje vertical (efecto lateral), en rad/s². */
  readonly spinDecel: number;
  /** Coeficiente de restitución bola contra bola. */
  readonly ballRestitution: number;
  /** Rozamiento entre bolas (lo que produce el "throw"). */
  readonly ballFriction: number;
  readonly cushionRestitution: number;
  readonly cushionFriction: number;
  /** Velocidad de la blanca con potencia 1, en m/s. */
  readonly maxSpeed: number;
}

export const POOL_CLOTH: ClothSpec = {
  slideFriction: 0.2,
  rollFriction: 0.01,
  spinDecel: 10,
  ballRestitution: 0.95,
  ballFriction: 0.06,
  cushionRestitution: 0.75,
  cushionFriction: 0.2,
  maxSpeed: 7.5,
};

export interface PocketTableOptions {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly ballRadius: number;
  /** Distancia desde la esquina hasta donde empieza la goma, en cada banda. */
  readonly cornerMouth: number;
  /** Media boca de la tronera del medio. */
  readonly sideMouth: number;
  readonly cloth: ClothSpec;
}

/** Arma una mesa de 6 troneras (pool o snooker) con sus gomas y puntas. */
export function pocketTable(o: PocketTableOptions): TableSpec {
  const { width: W, height: H, cornerMouth: cm, sideMouth: sm } = o;
  const jaw = 0.04;
  const lean = 0.012;
  const s = (ax: number, ay: number, bx: number, by: number): Segment => ({ a: vec(ax, ay), b: vec(bx, by) });
  const cushions: Segment[] = [
    // Bandas largas, partidas por las troneras del medio.
    s(cm, 0, W / 2 - sm, 0),
    s(W / 2 + sm, 0, W - cm, 0),
    s(cm, H, W / 2 - sm, H),
    s(W / 2 + sm, H, W - cm, H),
    // Bandas cortas.
    s(0, cm, 0, H - cm),
    s(W, cm, W, H - cm),
    // Puntas de las troneras de esquina: se abren hacia la tronera.
    s(cm, 0, cm - lean, -jaw),
    s(0, cm, -jaw, cm - lean),
    s(W - cm, 0, W - cm + lean, -jaw),
    s(W, cm, W + jaw, cm - lean),
    s(cm, H, cm - lean, H + jaw),
    s(0, H - cm, -jaw, H - cm + lean),
    s(W - cm, H, W - cm + lean, H + jaw),
    s(W, H - cm, W + jaw, H - cm + lean),
    // Puntas de las troneras del medio.
    s(W / 2 - sm, 0, W / 2 - sm - 0.005, -jaw),
    s(W / 2 + sm, 0, W / 2 + sm + 0.005, -jaw),
    s(W / 2 - sm, H, W / 2 - sm - 0.005, H + jaw),
    s(W / 2 + sm, H, W / 2 + sm + 0.005, H + jaw),
  ];
  const c = 0.02;
  const corner = 0.06;
  const side = sm;
  return {
    id: o.id,
    width: W,
    height: H,
    ballRadius: o.ballRadius,
    pockets: [
      { center: vec(-c, -c), radius: corner },
      { center: vec(W / 2, -0.035), radius: side },
      { center: vec(W + c, -c), radius: corner },
      { center: vec(-c, H + c), radius: corner },
      { center: vec(W / 2, H + 0.035), radius: side },
      { center: vec(W + c, H + c), radius: corner },
    ],
    cushions,
    headStringX: W / 4,
    footSpot: vec((3 * W) / 4, H / 2),
    cloth: o.cloth,
  };
}

/** Mesa de pool de 9 pies (área de juego 2,54 × 1,27 m), bolas de 57,2 mm. */
export const POOL_9FT: TableSpec = pocketTable({
  id: "pool-9ft",
  width: 2.54,
  height: 1.27,
  ballRadius: 0.05715 / 2,
  cornerMouth: 0.085,
  sideMouth: 0.065,
  cloth: POOL_CLOTH,
});

export interface TableProblem {
  readonly field: string;
  readonly message: string;
}

/** Revisa que una mesa sea coherente antes de usarla en el motor. */
export function validateTable(t: TableSpec): TableProblem[] {
  const problems: TableProblem[] = [];
  if (!(t.width > 0) || !(t.height > 0))
    problems.push({ field: "size", message: "Ancho y alto deben ser positivos" });
  if (!(t.ballRadius > 0))
    problems.push({ field: "ballRadius", message: "El radio de bola debe ser positivo" });
  if (t.ballRadius * 2 >= Math.min(t.width, t.height))
    problems.push({ field: "ballRadius", message: "La bola no cabe en la mesa" });
  t.pockets.forEach((p, i) => {
    if (!(p.radius > t.ballRadius))
      problems.push({ field: `pockets[${i}]`, message: "La tronera debe ser más grande que la bola" });
  });
  t.cushions.forEach((c, i) => {
    if (c.a.x === c.b.x && c.a.y === c.b.y)
      problems.push({ field: `cushions[${i}]`, message: "La goma no puede medir cero" });
  });
  if (t.cushions.length === 0) problems.push({ field: "cushions", message: "La mesa necesita gomas" });
  if (!(t.headStringX > 0 && t.headStringX < t.width))
    problems.push({ field: "headStringX", message: "La línea de cabecera debe estar dentro de la mesa" });
  for (const [k, v] of Object.entries(t.cloth)) {
    if (!(typeof v === "number" && v >= 0)) problems.push({ field: `cloth.${k}`, message: "Debe ser ≥ 0" });
  }
  if (!(t.cloth.ballRestitution <= 1 && t.cloth.cushionRestitution <= 1))
    problems.push({ field: "cloth", message: "La restitución no puede pasar de 1" });
  return problems;
}
