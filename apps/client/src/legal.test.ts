import { LEGAL } from "@tacazo/core";
import { describe, expect, it } from "vitest";
import { aceptacionDe } from "./legal.js";

describe("aceptación de los textos legales", () => {
  it("pide edad y la casilla marcada", () => {
    expect(aceptacionDe(null, false, true)).toBeNull();
    expect(aceptacionDe("18+", false, false)).toBeNull();
    expect(aceptacionDe("18+", false, true)).toEqual({ ...LEGAL, edad: "18+", autorizacion: false });
  });

  it("entre 14 y 17 exige la autorización del acudiente", () => {
    expect(aceptacionDe("14-17", false, true)).toBeNull();
    expect(aceptacionDe("14-17", true, true)).toEqual({ ...LEGAL, edad: "14-17", autorizacion: true });
  });

  it("por debajo de 14 no deja crear jugador", () => {
    expect(aceptacionDe("menor14", true, true)).toBe("menor");
  });

  it("la autorización no cuenta para mayores de edad", () => {
    expect(aceptacionDe("18+", true, true)).toMatchObject({ autorizacion: false });
  });
});
