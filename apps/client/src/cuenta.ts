import type { Edad } from "@tacazo/core";
import { delServidor, msg } from "./i18n/index.js";
import { urlServidor, type Asiento } from "./red.js";

/** Dirección de la API: meta `tacazo-api` o el puerto 3000 del mismo host. */
export function urlApi(): string {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="tacazo-api"]')?.content;
  return meta || `${location.protocol}//${location.hostname}:3000`;
}

export interface Invitado {
  readonly jugador: string;
  readonly token: string;
}

const CLAVE = "tacazo.invitado";

function leerInvitado(): Invitado | null {
  try {
    const x = localStorage.getItem(CLAVE);
    return x ? (JSON.parse(x) as Invitado) : null;
  } catch {
    return null;
  }
}

function guardarInvitado(i: Invitado): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(i));
  } catch {
    // Sin almacenamiento: se creará otro invitado la próxima vez.
  }
}

/** Token de Turnstile si la página trae su clave pública (`meta tacazo-turnstile`). */
async function tokenHumano(): Promise<string> {
  const sitio = document.querySelector<HTMLMetaElement>('meta[name="tacazo-turnstile"]')?.content;
  if (!sitio) return "";
  type Turnstile = {
    render(
      el: HTMLElement,
      o: { sitekey: string; callback(t: string): void; "error-callback"(): void },
    ): void;
  };
  const w = window as unknown as { turnstile?: Turnstile };
  if (!w.turnstile) {
    await new Promise<void>((ok, mal) => {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = () => ok();
      s.onerror = () => mal(new Error(msg().verificacion.noCargar));
      document.head.append(s);
    });
  }
  const caja = document.getElementById("turnstile")!;
  caja.hidden = false;
  try {
    return await new Promise<string>((ok, mal) =>
      w.turnstile!.render(caja, {
        sitekey: sitio,
        callback: ok,
        "error-callback": () => mal(new Error(msg().verificacion.noHumano)),
      }),
    );
  } finally {
    caja.hidden = true;
    caja.replaceChildren();
  }
}

async function json<T>(r: Response): Promise<T> {
  const d = (await r.json().catch(() => ({}))) as T & { error?: string; mensaje?: string; codigo?: string };
  // La API manda { error: código, mensaje }; el servidor de partidas, { error: texto, codigo? }.
  if (!r.ok) throw new Error(d.mensaje ? delServidor(d.mensaje, d.error) : delServidor(d.error, d.codigo));
  return d;
}

export const hayInvitado = (): boolean => leerInvitado() !== null;

/** Lo que el jugador acepta: versiones vigentes, rango de edad y, si es menor, la autorización. */
export interface Acepta {
  readonly terminos: string;
  readonly privacidad: string;
  readonly edad: Edad;
  readonly autorizacion: boolean;
}

/** El invitado de este navegador; lo crea la primera vez, con su aceptación. */
export async function invitado(nombre: string, acepta: Acepta | null): Promise<Invitado> {
  const ya = leerInvitado();
  if (ya) return ya;
  if (!acepta) throw new Error(msg().codigos.legal!);
  const r = await fetch(`${urlApi()}/invitados`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre, turnstile: await tokenHumano(), acepta }),
  });
  const nuevo = await json<Invitado>(r);
  guardarInvitado(nuevo);
  return nuevo;
}

/** El invitado guardado, sin crearlo. */
export const invitadoGuardado = leerInvitado;

function olvidarInvitado(): void {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // Nada que hacer.
  }
}

/** Si falta aceptar alguna versión vigente de los textos legales. */
export async function legalPendiente(i: Invitado): Promise<boolean> {
  const r = await fetch(`${urlApi()}/yo`, conSesion(i));
  return (await json<{ legal?: { pendiente: boolean } }>(r)).legal?.pendiente ?? true;
}

export async function aceptarLegal(i: Invitado, acepta: Acepta): Promise<void> {
  const r = await fetch(`${urlApi()}/yo/consentimientos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${i.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(acepta),
  });
  await json(r);
}

/** Todos los datos del jugador, como archivo para descargar. */
export async function misDatos(i: Invitado): Promise<Blob> {
  const r = await fetch(`${urlApi()}/yo/datos`, conSesion(i));
  if (!r.ok) await json(r);
  return r.blob();
}

/** Borra el jugador en el servidor y olvida la sesión en este navegador. */
export async function borrarJugador(i: Invitado): Promise<void> {
  const r = await fetch(`${urlApi()}/yo`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${i.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ confirmar: "BORRAR" }),
  });
  if (!r.ok) await json(r);
  olvidarInvitado();
}

/** Token corto para el servidor de partidas. */
export async function sesionJuego(i: Invitado): Promise<string> {
  const r = await fetch(`${urlApi()}/sesion-juego`, {
    method: "POST",
    headers: { Authorization: `Bearer ${i.token}` },
  });
  // El token guardado ya no vale (por ejemplo, otra base de datos): se olvida.
  if (r.status === 401) olvidarInvitado();
  return (await json<{ token: string }>(r)).token;
}

export interface SalaNivel {
  readonly id: string;
  readonly nombre: string;
  readonly entrada: number;
  readonly premio: number;
}

export interface Monedas {
  readonly saldo: number;
  readonly salas: readonly SalaNivel[];
  readonly diario: { readonly monto: number; readonly disponible: boolean; readonly enMs: number };
  /** Anuncio con premio: solo si no alcanza para la sala más barata. */
  readonly anuncio: { readonly monto: number; readonly restantes: number; readonly disponible: boolean };
}

const conSesion = (i: Invitado, metodo = "GET") =>
  ({ method: metodo, headers: { Authorization: `Bearer ${i.token}` } }) as const;

/** Saldo, salas y si ya puede cobrar el premio diario. */
export async function monedas(i: Invitado): Promise<Monedas> {
  return json<Monedas>(await fetch(`${urlApi()}/monedas`, conSesion(i)));
}

/** Cobra el premio diario; devuelve el saldo nuevo. */
export async function cobrarDiario(i: Invitado): Promise<number> {
  return (await json<{ saldo: number }>(await fetch(`${urlApi()}/monedas/diario`, conSesion(i, "POST"))))
    .saldo;
}

export type EstadoBusqueda = { estado: "buscando" } | ({ estado: "emparejado"; rival: string } & Asiento);

/**
 * Busca rival en la cola clasificatoria y pregunta cada 1,5 s. Devuelve una
 * función para cancelar.
 */
export function buscarRival(
  token: string,
  sala: string,
  alCambiar: (e: EstadoBusqueda) => void,
  alFallar: (motivo: string) => void,
): () => void {
  let activo = true;
  let temporizador = 0;
  const pedir = (metodo: string, cuerpo?: unknown) =>
    fetch(`${urlServidor()}/cola`, {
      method: metodo,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
    });
  const leer = async (r: Response) => {
    const e = await json<EstadoBusqueda | { estado: "nada"; motivo?: string; codigo?: string }>(r);
    if (!activo) return;
    if (e.estado === "emparejado") {
      activo = false;
      alCambiar(e);
      return;
    }
    if (e.estado === "nada") {
      activo = false;
      alFallar(e.motivo ? delServidor(e.motivo, e.codigo) : msg().cola.saliste);
      return;
    }
    alCambiar(e);
    temporizador = window.setTimeout(() => void pedir("GET").then(leer).catch(fallo), 1500);
  };
  const fallo = (e: unknown) => {
    if (!activo) return;
    activo = false;
    alFallar(e instanceof Error ? e.message : msg().cola.noBuscar);
  };
  void pedir("POST", { modo: "bola8", sala }).then(leer).catch(fallo);
  return () => {
    if (!activo) return;
    activo = false;
    clearTimeout(temporizador);
    void pedir("DELETE").catch(() => {});
  };
}
