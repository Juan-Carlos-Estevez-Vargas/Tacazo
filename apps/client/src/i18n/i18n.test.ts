import html from "../../index.html?raw";
import anunciosTs from "../anuncios.ts?raw";
import cuentaTs from "../cuenta.ts?raw";
import juegoTs from "../juego.ts?raw";
import mesaTs from "../mesa.ts?raw";
import redTs from "../red.ts?raw";
import { describe, expect, it } from "vitest";
import { en } from "./en.js";
import { es } from "./es.js";
import { cambiarIdioma, delServidor, idioma, msg, numero, textoDe } from "./index.js";
import { elegirIdioma } from "./idiomas.js";
import { pt } from "./pt.js";

/** Rutas de todas las hojas del diccionario, con el tipo de cada una. */
function hojas(x: unknown, base = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    const ruta = base ? `${base}.${k}` : k;
    if (typeof v === "object" && v !== null) for (const [r, t] of hojas(v, ruta)) out.set(r, t);
    else out.set(ruta, typeof v === "function" ? `function/${v.length}` : typeof v);
  }
  return out;
}

describe("idiomas", () => {
  it("elige el del dispositivo, el guardado o el base", () => {
    expect(elegirIdioma(["pt-BR", "en"])).toBe("pt");
    expect(elegirIdioma(["en-GB"])).toBe("en");
    expect(elegirIdioma(["fr-FR", "de"])).toBe("es");
    expect(elegirIdioma([])).toBe("es");
    expect(elegirIdioma(["en"], "pt")).toBe("pt");
    expect(elegirIdioma(["en"], "xx")).toBe("en");
  });

  it("las traducciones tienen las mismas claves y ningún texto vacío", () => {
    const base = hojas(es);
    // `servidor` va vacío en español: el servidor ya habla español.
    const sinServidor = (m: Map<string, string>) => [...m].filter(([r]) => !r.startsWith("servidor."));
    for (const otro of [en, pt]) {
      expect(sinServidor(hojas(otro))).toEqual(sinServidor(base));
      for (const [ruta, tipo] of hojas(otro))
        if (tipo === "string") expect(textoDe(otro, ruta), ruta).not.toBe("");
      expect(Object.keys(otro.servidor).sort()).toEqual(Object.keys(en.servidor).sort());
    }
    // Las funciones devuelven texto en todos los idiomas.
    for (const d of [es, en, pt]) {
      expect(d.cola.buscando(3)).toMatch(/3/);
      expect(d.sala.saldo("1.000")).toHaveLength(3);
      expect(d.juego.gano(null)).not.toBe("");
    }
  });

  it("cada data-t del HTML existe en el diccionario", () => {
    const rutas = [...html.matchAll(/data-t(?:-aria|-title|-placeholder)?="([^"]+)"/g)].map((m) => m[1]!);
    expect(rutas.length).toBeGreaterThan(30);
    for (const r of rutas) expect(textoDe(es, r), r).not.toBeNull();
  });

  it("no quedan textos en español escritos en el código", () => {
    const fuentes = { juegoTs, cuentaTs, redTs, anunciosTs, mesaTs };
    for (const [f, texto] of Object.entries(fuentes)) {
      expect(texto.length, f).toBeGreaterThan(500);
      const codigo = texto
        .split("\n")
        .filter((l: string) => !/^\s*(\/\/|\*|\/\*\*)/.test(l) && !l.includes("console."))
        .join("\n");
      // Frases con letras propias del español entre comillas.
      const sueltos = codigo.match(/["`][^"`\n]*[áéíóúñ¿¡][^"`\n]*["`]/g) ?? [];
      expect(sueltos, f).toEqual([]);
    }
  });

  it("cambia de idioma, formatea números y traduce al servidor", async () => {
    await cambiarIdioma("en", false);
    expect(idioma()).toBe("en");
    expect(msg().juego.ganaste).toBe("You won!");
    expect(numero(12345)).toBe("12,345");
    expect(delServidor("No es tu turno")).toBe("It's not your turn");
    expect(delServidor("Algo nuevo que no conocemos")).toBe("Algo nuevo que no conocemos");
    expect(delServidor("No te alcanzan las monedas: la entrada a Club cuesta 200", "saldo")).toBe(
      "You don't have enough coins.",
    );
    expect(delServidor(undefined)).toBe("Couldn't connect");
    await cambiarIdioma("es", false);
    expect(numero(12345)).toBe("12.345");
    expect(delServidor("No es tu turno")).toBe("No es tu turno");
  });
});
