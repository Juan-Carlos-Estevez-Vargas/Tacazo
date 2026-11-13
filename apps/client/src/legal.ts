/**
 * Aceptación de los términos y la política de privacidad (Ley 1581): casilla
 * sin marcar, rango de edad y, entre 14 y 17, la autorización del acudiente.
 * La API guarda la prueba; aquí solo se pregunta.
 */
import { LEGAL } from "@tacazo/core";
import { borrarJugador, invitadoGuardado, misDatos, type Acepta } from "./cuenta.js";
import { msg } from "./i18n/index.js";

export type EdadElegida = "menor14" | "14-17" | "18+" | null;

/** Qué permite el formulario: la aceptación lista, "menor" si no llega a la edad, o null si falta algo. */
export function aceptacionDe(
  edad: EdadElegida,
  autorizacion: boolean,
  acepto: boolean,
): Acepta | "menor" | null {
  if (edad === "menor14") return "menor";
  if (!edad || !acepto) return null;
  if (edad === "14-17" && !autorizacion) return null;
  return { terminos: LEGAL.terminos, privacidad: LEGAL.privacidad, edad, autorizacion: edad === "14-17" };
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Muestra el diálogo y resuelve con la aceptación, o null si cancela o no tiene la edad. */
export function pedirAceptacion(cambio = false): Promise<Acepta | null> {
  const d = $<HTMLDialogElement>("dialogo-legal");
  const autorizacion = $<HTMLInputElement>("legal-autorizacion");
  const acepto = $<HTMLInputElement>("legal-acepto");
  const ok = $<HTMLButtonElement>("legal-ok");
  const radios = [...d.querySelectorAll<HTMLInputElement>('input[name="edad"]')];
  $("legal-cambio").hidden = !cambio;
  for (const r of radios) r.checked = false;
  autorizacion.checked = false;
  acepto.checked = false;

  const edad = (): EdadElegida => (radios.find((r) => r.checked)?.value as EdadElegida) ?? null;
  const revisar = () => {
    const e = edad();
    $("legal-autorizacion-caja").hidden = e !== "14-17";
    $("legal-menor14").hidden = e !== "menor14";
    acepto.disabled = e === "menor14";
    const r = aceptacionDe(e, autorizacion.checked, acepto.checked);
    ok.disabled = r === null || r === "menor";
  };
  revisar();
  d.addEventListener("change", revisar);
  d.showModal();
  return new Promise((listo) => {
    d.addEventListener(
      "close",
      () => {
        d.removeEventListener("change", revisar);
        const r = aceptacionDe(edad(), autorizacion.checked, acepto.checked);
        listo(d.returnValue === "ok" && r !== null && r !== "menor" ? r : null);
      },
      { once: true },
    );
  });
}

/** Botón «Mis datos»: descargar todo o borrar el jugador. Solo se ve si hay jugador. */
export function prepararMisDatos(alBorrar: () => void): { actualizar(): void } {
  const boton = $<HTMLButtonElement>("mis-datos");
  const d = $<HTMLDialogElement>("dialogo-datos");
  const confirmar = $<HTMLInputElement>("datos-confirmar");
  const borrar = $<HTMLButtonElement>("datos-borrar");
  const estado = $("datos-estado");
  const actualizar = () => {
    boton.hidden = invitadoGuardado() === null;
  };
  boton.addEventListener("click", () => {
    confirmar.value = "";
    borrar.disabled = true;
    estado.textContent = "";
    d.showModal();
  });
  confirmar.addEventListener("input", () => {
    borrar.disabled = confirmar.value.trim().toUpperCase() !== "BORRAR";
  });
  $("datos-bajar").addEventListener("click", async () => {
    const i = invitadoGuardado();
    if (!i) return;
    estado.textContent = msg().datos.bajando;
    try {
      const url = URL.createObjectURL(await misDatos(i));
      const a = document.createElement("a");
      a.href = url;
      a.download = "tacazo-mis-datos.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      estado.textContent = "";
    } catch (e) {
      estado.textContent = e instanceof Error ? e.message : String(e);
    }
  });
  borrar.addEventListener("click", async () => {
    const i = invitadoGuardado();
    if (!i) return;
    borrar.disabled = true;
    try {
      await borrarJugador(i);
      estado.textContent = msg().datos.borrado;
      actualizar();
      alBorrar();
    } catch (e) {
      estado.textContent = e instanceof Error ? e.message : String(e);
      borrar.disabled = false;
    }
  });
  actualizar();
  return { actualizar };
}
