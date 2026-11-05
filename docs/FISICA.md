# Física

El motor vive en `packages/core` y es **determinista**: la misma entrada da el
mismo resultado en cualquier máquina. Por eso el servidor puede decidir cada
tiro y las repeticiones se pueden volver a simular.

## Reglas del motor

- Paso fijo (objetivo: 1/480 s), desacoplado del dibujo; el cliente interpola.
- Sin `Math.random`, reloj ni APIs del navegador: lo impide el lint.
  La aleatoriedad sale de `createRng(semilla)` con la semilla del servidor.
- Cada cambio de física sube `ENGINE_VERSION`; el servidor rechaza clientes con
  otra versión.

## Mesas como datos

| Mesa | Área de juego | Bola | Troneras | Estado |
| --- | --- | --- | --- | --- |
| `pool-9ft` | 2,54 × 1,27 m | 57,2 mm | 6 | ✅ en `table.ts` |
| Carambola | 2,84 × 1,42 m | 61,5 mm | 0 | Fase 8 |
| Snooker | 3,57 × 1,78 m | 52,5 mm | 6 estrechas | Fase 8 |

`validateTable()` revisa que una mesa sea coherente antes de usarla.

## Pendiente (fase 1)

| Punto | Issue |
| --- | --- |
| Choque bola-bola con detección continua, rozamiento deslizando y rodando | #10 |
| Efecto completo: arriba, abajo, lateral, desvío y curva | #12 |
| Tiros dorados en CI | #13 |
