import { afterEach, describe, expect, it } from "vitest";
import es from "./messages/es";
import en from "./messages/en";
import pt from "./messages/pt";
import { matchLocale } from "./locales";
import { fromServer } from "./serverMessages";
import { getLocale, msg, setLocale } from "./store";

describe("idioma del sistema", () => {
  it("toma el primer idioma disponible de las preferencias", () => {
    expect(matchLocale(["pt-BR", "en-US"])).toBe("pt");
    expect(matchLocale(["fr-FR", "en-GB"])).toBe("en");
  });

  it("si ninguno está disponible, usa el idioma base", () => {
    expect(matchLocale(["de-DE"])).toBe("es");
    expect(matchLocale(undefined)).toBe("es");
  });
});

/** Cada ruta del diccionario con el tipo de su valor. */
function shape(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) return [`${path}:array:${value.length}`];
  if (value && typeof value === "object") {
    return Object.keys(value).sort().flatMap((k) => shape((value as Record<string, unknown>)[k], `${path}.${k}`));
  }
  return [`${path}:${typeof value}`];
}

const empties = (value: unknown, path = ""): string[] =>
  value === "" ? [path] : value && typeof value === "object"
    ? Object.entries(value).flatMap(([k, v]) => empties(v, `${path}.${k}`)) : [];

describe("diccionarios", () => {
  it("todas las traducciones tienen las mismas claves que el idioma base", () => {
    expect(shape(en)).toEqual(shape(es));
    expect(shape(pt)).toEqual(shape(es));
  });

  it("ninguna traducción deja textos vacíos", () => {
    const allowed = new Set(empties(es));
    expect(empties(en).filter((p) => !allowed.has(p))).toEqual([]);
    expect(empties(pt).filter((p) => !allowed.has(p))).toEqual([]);
  });
});

describe("cambio de idioma", () => {
  afterEach(() => setLocale("es", { remember: false }));

  it("cambia el diccionario activo y traduce los mensajes del servidor", async () => {
    await setLocale("en", { remember: false });
    expect(getLocale()).toBe("en");
    expect(msg().common.cancel).toBe(en.common.cancel);
    expect(fromServer(es.errors.server.invalidLink)).toBe(en.errors.server.invalidLink);
    expect(fromServer("Otro texto")).toBe("Otro texto");
  });
});
