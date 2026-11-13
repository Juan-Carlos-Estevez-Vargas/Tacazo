/**
 * Prueba de carga con bots: abre N salas a la vez, dos bots por sala que tiran
 * al azar (tiros válidos) y mide cuánto tarda el servidor en responder cada
 * tiro. Al terminar una partida, el par empieza otra.
 *
 *   TACAZO_SALAS_POR_MINUTO=100000 pnpm --filter @tacazo/game-server start   # en otra terminal
 *   pnpm --filter @tacazo/game-server carga -- --salas 200 --segundos 60 [--url http://127.0.0.1:2567]
 *
 * Mira la CPU del proceso del servidor mientras corre (top, htop o el panel del hosting).
 */
import { parseArgs } from "node:util";
import {
  ENGINE_VERSION,
  POOL_9FT,
  PROTOCOLO,
  bola8,
  createRng,
  createWorld,
  type MensajeServidor,
  type Rng,
  type Snapshot,
} from "@tacazo/core";
import WebSocket from "ws";

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "http://127.0.0.1:2567" },
    salas: { type: "string", default: "50" },
    segundos: { type: "string", default: "30" },
    // Lo que "piensa" cada bot antes de tirar, en milisegundos.
    pensar: { type: "string", default: "500" },
  },
});
const URL_HTTP = values.url!.replace(/\/$/, "");
const URL_WS = `${URL_HTTP.replace(/^http/, "ws")}/ws`;
const SALAS = Number(values.salas);
const SEGUNDOS = Number(values.segundos);
const PENSAR = Number(values.pensar);

const latencias: number[] = [];
const cuenta = { partidas: 0, tiros: 0, rechazos: 0, errores: 0, conexiones: 0 };
let activo = true;

async function post(ruta: string, cuerpo: unknown): Promise<{ sala: string; jugador: 0 | 1; token: string }> {
  const r = await fetch(`${URL_HTTP}${ruta}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  if (!r.ok) throw new Error(`${ruta}: ${r.status} ${await r.text()}`);
  return (await r.json()) as { sala: string; jugador: 0 | 1; token: string };
}

/** Un tiro al azar pero válido para el estado: blanca en un sitio permitido y tronera si toca la 8. */
function tiroAlAzar(e: Snapshot, rng: Rng, seq: number) {
  const w = createWorld(POOL_9FT, e.bolas);
  for (const b of w.balls) b.onTable = e.bolas.find((x) => x.id === b.id)!.onTable;
  const mano = e.reglas.ballInHand;
  let blanca: { x: number; y: number } | undefined;
  if (mano !== "no") {
    for (let i = 0; i < 200 && !blanca; i++) {
      const x = POOL_9FT.width * rng.next();
      const y = POOL_9FT.height * rng.next();
      if (bola8.canPlaceCueBall(w, mano, x, y)) blanca = { x, y };
    }
  }
  const necesitaCantar = bola8.needsCall(e.reglas, bola8.ballsOnTable(w));
  return {
    t: "tirar" as const,
    seq,
    tiro: {
      angle: (rng.next() * 2 - 1) * Math.PI,
      power: 0.3 + rng.next() * 0.7,
      side: 0,
      top: 0,
      elevation: 0,
    },
    ...(blanca ? { blanca } : {}),
    ...(necesitaCantar ? { cantar: Math.floor(rng.next() * POOL_9FT.pockets.length) } : {}),
  };
}

/** Un bot conectado a una silla. Resuelve cuando la partida termina o se corta. */
function bot(asiento: { sala: string; jugador: 0 | 1; token: string }, semilla: number): Promise<void> {
  return new Promise((listo) => {
    const rng = createRng(semilla);
    const ws = new WebSocket(URL_WS, { headers: { Origin: "http://localhost:4173" } });
    let seq = 0;
    let enviado = 0;
    let turnoPedido = -1;
    const terminar = () => {
      ws.close();
      listo();
    };
    ws.on("open", () => {
      cuenta.conexiones++;
      ws.send(
        JSON.stringify({ t: "saludo", token: asiento.token, cliente: PROTOCOLO, motor: ENGINE_VERSION }),
      );
    });
    const jugar = (e: Snapshot) => {
      if (!activo || e.fase === "terminada") return terminar();
      if (e.fase !== "jugando" || e.reglas.turn !== asiento.jugador) return;
      seq = e.secuencias[asiento.jugador];
      if (turnoPedido === seq) return;
      turnoPedido = seq;
      setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        enviado = performance.now();
        ws.send(JSON.stringify(tiroAlAzar(e, rng, seq + 1)));
      }, PENSAR);
    };
    ws.on("message", (datos) => {
      const m = JSON.parse(String(datos)) as MensajeServidor;
      if (m.t === "bienvenida" || m.t === "estado" || m.t === "tiempo") jugar(m.estado);
      else if (m.t === "resultado") {
        if (m.jugador === asiento.jugador) {
          latencias.push(performance.now() - enviado);
          cuenta.tiros++;
        }
        jugar(m.estado);
      } else if (m.t === "rechazo") {
        cuenta.rechazos++;
        turnoPedido = -1;
      } else if (m.t === "error") {
        cuenta.errores++;
        terminar();
      }
    });
    ws.on("error", () => {
      cuenta.errores++;
      listo();
    });
    ws.on("close", () => listo());
  });
}

/** Una mesa: crea sala, sienta dos bots y repite mientras dure la prueba. */
async function mesa(i: number): Promise<void> {
  let n = 0;
  while (activo) {
    try {
      const a = await post("/salas", { nombre: `Bot${i}a` });
      const b = await post(`/salas/${encodeURIComponent(a.sala)}/unirse`, { nombre: `Bot${i}b` });
      await Promise.all([bot(a, i * 1000 + n * 2), bot(b, i * 1000 + n * 2 + 1)]);
      if (activo) cuenta.partidas++;
    } catch (e) {
      cuenta.errores++;
      console.error(e instanceof Error ? e.message : e);
      await new Promise((r) => setTimeout(r, 1000));
    }
    n++;
  }
}

const percentil = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const o = [...xs].sort((a, b) => a - b);
  return o[Math.min(o.length - 1, Math.floor((p / 100) * o.length))]!;
};

console.log(`Carga: ${SALAS} salas, ${SEGUNDOS} s, contra ${URL_HTTP}`);
const inicio = performance.now();
const mesas = Array.from({ length: SALAS }, (_, i) => mesa(i));
const informe = setInterval(() => {
  const s = Math.round((performance.now() - inicio) / 1000);
  console.log(
    `${s} s · tiros ${cuenta.tiros} · p95 ${percentil(latencias, 95).toFixed(0)} ms · errores ${cuenta.errores}`,
  );
}, 5000);
await new Promise((r) => setTimeout(r, SEGUNDOS * 1000));
activo = false;
clearInterval(informe);
await Promise.race([Promise.all(mesas), new Promise((r) => setTimeout(r, 5000))]);

const seg = (performance.now() - inicio) / 1000;
console.log("\nResultado");
console.log(`  salas a la vez      ${SALAS}`);
console.log(`  partidas terminadas ${cuenta.partidas}`);
console.log(`  tiros               ${cuenta.tiros} (${(cuenta.tiros / seg).toFixed(1)} por segundo)`);
console.log(
  `  respuesta al tiro   p50 ${percentil(latencias, 50).toFixed(0)} ms · p95 ${percentil(latencias, 95).toFixed(0)} ms · p99 ${percentil(latencias, 99).toFixed(0)} ms`,
);
console.log(`  rechazos ${cuenta.rechazos} · errores ${cuenta.errores}`);
process.exit(0);
