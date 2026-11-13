/**
 * Tarjeta de anuncio discreta (AdSense en la web): pequeña, sin sonido,
 * cerrable y solo en menús. No se carga ningún script de anuncios hasta que la
 * persona elige en el aviso de privacidad. Sin las metas `tacazo-adsense` y
 * `tacazo-adsense-slot` no aparece nada.
 */
import {
  leerConsentimiento,
  mostrarTarjeta,
  soloNoPersonalizados,
  VERSION_CONSENTIMIENTO,
  type Consentimiento,
  type Lugar,
} from "./politica-anuncios.js";

const CLAVE = "tacazo.anuncios";
const meta = (n: string) => document.querySelector<HTMLMetaElement>(`meta[name="${n}"]`)?.content ?? "";
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

type Cola = unknown[] & { requestNonPersonalizedAds?: number };

export class Anuncios {
  private readonly cliente = meta("tacazo-adsense");
  private readonly bloque = meta("tacazo-adsense-slot");
  private lugar: Lugar = "mesa";
  /** Cerrada por la persona en esta visita. */
  private cerrada = false;
  private cargado = false;
  /** Ya se preguntó en esta visita (si cerró el aviso sin elegir, no se insiste). */
  private preguntado = false;

  constructor() {
    $("anuncio-cerrar").addEventListener("click", () => {
      this.cerrada = true;
      this.pintar();
    });
    $("privacidad").addEventListener("click", () => void this.preguntar());
    $("privacidad").hidden = !this.configurado;
  }

  get configurado(): boolean {
    return /^ca-pub-\d+$/.test(this.cliente) && /^\d+$/.test(this.bloque);
  }

  private get consentimiento(): Consentimiento | null {
    try {
      return leerConsentimiento(localStorage.getItem(CLAVE));
    } catch {
      return null;
    }
  }

  /** Cambia de pantalla: la tarjeta solo puede verse en menús. */
  ponerEn(lugar: Lugar): void {
    this.lugar = lugar;
    if (lugar === "menu" && this.configurado && !this.consentimiento && !this.preguntado) {
      void this.preguntar();
      return;
    }
    this.pintar();
  }

  /** Aviso de privacidad: qué tipo de anuncios acepta. */
  async preguntar(): Promise<void> {
    this.preguntado = true;
    const d = $<HTMLDialogElement>("dialogo-anuncios");
    const menor = $<HTMLInputElement>("anuncios-menor");
    menor.checked = this.consentimiento?.menor ?? false;
    d.returnValue = "";
    d.showModal();
    await new Promise<void>((ok) => d.addEventListener("close", () => ok(), { once: true }));
    if (d.returnValue === "generales" || d.returnValue === "intereses") {
      const c: Consentimiento = {
        personalizados: d.returnValue === "intereses",
        menor: menor.checked,
        version: VERSION_CONSENTIMIENTO,
      };
      try {
        localStorage.setItem(CLAVE, JSON.stringify(c));
      } catch {
        // Sin almacenamiento se volverá a preguntar en la próxima visita.
      }
      // Si ya se cargó con otra elección, se aplica al recargar.
    }
    this.pintar();
  }

  private pintar(): void {
    const c = this.consentimiento;
    const ver = mostrarTarjeta(this.lugar, c, this.configurado, this.cerrada);
    $("anuncio").hidden = !ver;
    if (ver && c && !this.cargado) this.cargar(c);
  }

  private cargar(c: Consentimiento): void {
    this.cargado = true;
    const w = window as unknown as { adsbygoogle?: Cola };
    const cola: Cola = (w.adsbygoogle ??= []);
    if (soloNoPersonalizados(c)) cola.requestNonPersonalizedAds = 1;
    const s = document.createElement("script");
    s.async = true;
    s.crossOrigin = "anonymous";
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(this.cliente)}`;
    document.head.append(s);
    const ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.dataset.adClient = this.cliente;
    ins.dataset.adSlot = this.bloque;
    ins.dataset.adFormat = "horizontal";
    ins.dataset.fullWidthResponsive = "false";
    $("anuncio-caja").replaceChildren(ins);
    cola.push({});
  }
}
