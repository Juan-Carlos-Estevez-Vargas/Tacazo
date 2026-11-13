/**
 * Textos de la interfaz. Sin framework: `msg()` da el diccionario activo y
 * `traducirPagina()` llena los elementos marcados con `data-t*` en el HTML.
 * El español va en el paquete; inglés y portugués se descargan al usarlos.
 */
import { es, type Mensajes } from "./es.js";
import { BASE, bcp47, elegirIdioma, IDIOMAS, type Idioma } from "./idiomas.js";

export { IDIOMAS, type Idioma } from "./idiomas.js";

const CLAVE = "tacazo.idioma";
let actual: Idioma = BASE;
let dic: Mensajes = es;
let numeros = new Intl.NumberFormat(bcp47(BASE));
const oyentes = new Set<() => void>();

const cargadores: Record<Idioma, () => Promise<Mensajes>> = {
  es: async () => es,
  en: async () => (await import("./en.js")).en,
  pt: async () => (await import("./pt.js")).pt,
};

export const msg = (): Mensajes => dic;
export const idioma = (): Idioma => actual;
/** Número con el formato del idioma activo (1.000 · 1,000). */
export const numero = (n: number): string => numeros.format(n);

/** Avisa cuando cambia el idioma (para volver a pintar textos hechos en código). */
export function alCambiarIdioma(fn: () => void): () => void {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

function leerGuardado(): string | null {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

export async function cambiarIdioma(i: Idioma, guardar = true): Promise<void> {
  dic = await cargadores[i]();
  actual = i;
  numeros = new Intl.NumberFormat(bcp47(i));
  if (guardar) {
    try {
      localStorage.setItem(CLAVE, i);
    } catch {
      // Sin almacenamiento se vuelve a detectar la próxima vez.
    }
  }
  if (typeof document !== "undefined") traducirPagina();
  for (const fn of oyentes) fn();
}

/** Arranca en el idioma guardado o, si no hay, en el del dispositivo. */
export async function iniciarIdiomas(): Promise<void> {
  const i = elegirIdioma(navigator.languages ?? [navigator.language], leerGuardado());
  await cambiarIdioma(i, false);
}

/** Busca un texto por ruta (`html.cancelar`). Solo textos fijos, no funciones. */
export function textoDe(d: Mensajes, ruta: string): string | null {
  let x: unknown = d;
  for (const parte of ruta.split(".")) {
    if (typeof x !== "object" || x === null) return null;
    x = (x as Record<string, unknown>)[parte];
  }
  return typeof x === "string" ? x : null;
}

const ATRIBUTOS = [
  ["data-t-aria", "aria-label"],
  ["data-t-title", "title"],
  ["data-t-placeholder", "placeholder"],
] as const;

/** Pone los textos del idioma activo en el HTML, `<html lang>` y el título. */
export function traducirPagina(raiz: ParentNode = document): void {
  document.documentElement.lang = actual;
  document.title = dic.html.titulo;
  document.querySelector('meta[name="description"]')?.setAttribute("content", dic.html.descripcion);
  for (const el of raiz.querySelectorAll<HTMLElement>("[data-t]")) {
    const t = textoDe(dic, el.dataset.t!);
    if (t !== null) el.textContent = t;
  }
  for (const [dato, atributo] of ATRIBUTOS) {
    for (const el of raiz.querySelectorAll<HTMLElement>(`[${dato}]`)) {
      const t = textoDe(dic, el.getAttribute(dato)!);
      if (t !== null) el.setAttribute(atributo, t);
    }
  }
}

/**
 * Traduce lo que responde el servidor (que habla español): primero por código
 * de error y luego por texto conocido. Lo desconocido se muestra tal cual.
 */
export function delServidor(texto: string | undefined | null, codigo?: string | null): string {
  if (codigo && dic.codigos[codigo]) return dic.codigos[codigo]!;
  if (!texto) return dic.comun.sinConexion;
  return dic.servidor[texto] ?? texto;
}

export const nombreIdioma = (i: Idioma): string => IDIOMAS.find((x) => x.codigo === i)!.nombre;
