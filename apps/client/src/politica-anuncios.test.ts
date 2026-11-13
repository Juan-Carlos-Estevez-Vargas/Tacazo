import { describe, expect, it } from "vitest";
import {
  leerConsentimiento,
  mostrarTarjeta,
  soloNoPersonalizados,
  VERSION_CONSENTIMIENTO,
} from "./politica-anuncios.js";

const si = { personalizados: true, menor: false, version: VERSION_CONSENTIMIENTO };

describe("política de anuncios", () => {
  it("sin consentimiento válido no hay anuncios", () => {
    expect(leerConsentimiento(null)).toBeNull();
    expect(leerConsentimiento("basura")).toBeNull();
    expect(leerConsentimiento(JSON.stringify({ personalizados: "si", menor: false, version: 1 }))).toBeNull();
    // Si cambia el texto del consentimiento, se vuelve a preguntar.
    expect(leerConsentimiento(JSON.stringify({ ...si, version: 0 }))).toBeNull();
    expect(leerConsentimiento(JSON.stringify(si))).toEqual(si);
    expect(mostrarTarjeta("menu", null, true, false)).toBe(false);
  });

  it("a menores y a quien no acepta, solo no personalizados", () => {
    expect(soloNoPersonalizados(si)).toBe(false);
    expect(soloNoPersonalizados({ ...si, menor: true })).toBe(true);
    expect(soloNoPersonalizados({ ...si, personalizados: false })).toBe(true);
  });

  it("solo en menús, si está configurado y no se cerró", () => {
    expect(mostrarTarjeta("menu", si, true, false)).toBe(true);
    expect(mostrarTarjeta("mesa", si, true, false)).toBe(false);
    expect(mostrarTarjeta("menu", si, false, false)).toBe(false);
    expect(mostrarTarjeta("menu", si, true, true)).toBe(false);
  });
});
