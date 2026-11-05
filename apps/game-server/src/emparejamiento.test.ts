import { describe, expect, it } from "vitest";
import { Cola, Colas, compatibles, rango, RANGO_MAXIMO, type EnCola } from "./emparejamiento.js";

const j = (id: string, rating: number, extra: Partial<EnCola> = {}): EnCola => ({
  id,
  rating,
  region: "sa",
  recientes: [],
  desde: 0,
  ...extra,
});

describe("emparejamiento", () => {
  it("el rango crece con la espera hasta el máximo", () => {
    const a = j("a", 1500);
    expect(rango(a, 0)).toBe(100);
    expect(rango(a, 10_000)).toBe(200);
    expect(rango(a, 10 * 60_000)).toBe(RANGO_MAXIMO);
  });

  it("solo empareja cuando el rango de los dos lo permite", () => {
    const a = j("a", 1500);
    const b = j("b", 1750, { desde: 0 });
    expect(compatibles(a, b, 0)).toBe(false);
    expect(compatibles(a, b, 15_000)).toBe(true);
    // Si b acaba de llegar, su rango todavía es pequeño.
    expect(compatibles(a, j("b", 1750, { desde: 15_000 }), 15_000)).toBe(false);
  });

  it("prefiere la misma región y acepta otra tras esperar", () => {
    const a = j("a", 1500);
    const b = j("b", 1500, { region: "eu" });
    expect(compatibles(a, b, 1000)).toBe(false);
    expect(compatibles(a, b, 16_000)).toBe(true);

    const cola = new Cola();
    cola.entrar(a);
    cola.entrar(j("c", 1580, { region: "eu", desde: 0 }));
    cola.entrar(j("d", 1590, { desde: 0 }));
    const [p] = cola.emparejar(20_000);
    expect(p?.b.id).toBe("d");
  });

  it("evita repetir rival hasta que la espera es larga", () => {
    const a = j("a", 1500, { recientes: ["b", "x"] });
    const b = j("b", 1500);
    expect(compatibles(a, b, 1000)).toBe(false);
    expect(compatibles(a, b, 61_000)).toBe(true);
    // Un rival de hace más de 3 partidas sí vale.
    expect(compatibles(j("a", 1500, { recientes: ["b", "x", "y", "z"] }), b, 1000)).toBe(true);
  });

  it("atiende primero al que más espera y elige el rating más parecido", () => {
    const cola = new Cola();
    cola.entrar(j("nuevo", 1500, { desde: 5000 }));
    cola.entrar(j("viejo", 1520, { desde: 0 }));
    cola.entrar(j("cerca", 1525, { desde: 4000 }));
    const parejas = cola.emparejar(5000);
    expect(parejas).toHaveLength(1);
    expect([parejas[0]!.a.id, parejas[0]!.b.id]).toEqual(["viejo", "cerca"]);
    expect(cola.tamano).toBe(1);
  });

  it("un jugador no queda en dos parejas ni consigo mismo", () => {
    const cola = new Cola();
    for (let i = 0; i < 9; i++) cola.entrar(j(`p${i}`, 1500 + i * 5, { desde: i }));
    const parejas = cola.emparejar(100);
    const ids = parejas.flatMap((p) => [p.a.id, p.b.id]);
    expect(parejas).toHaveLength(4);
    expect(new Set(ids).size).toBe(8);
    expect(cola.tamano).toBe(1);
  });

  it("las colas van separadas por modo y sala", () => {
    const colas = new Colas();
    colas.cola("bola8", "barrio").entrar(j("a", 1500));
    colas.cola("bola8", "club").entrar(j("b", 1500));
    expect(colas.emparejar(0)).toHaveLength(0);
    colas.cola("bola8", "barrio").entrar(j("c", 1500));
    const out = colas.emparejar(0);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ modo: "bola8", sala: "barrio" });
    colas.salir("b");
    expect(colas.cola("bola8", "club").tamano).toBe(0);
  });
});
