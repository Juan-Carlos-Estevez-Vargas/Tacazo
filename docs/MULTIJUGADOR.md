# Multijugador

El billar es por turnos: el cliente manda la **intención del tiro** y el
servidor decide qué pasó. El ciclo está en
[DIAGRAMAS.md](DIAGRAMAS.md#ciclo-de-un-tiro).

## Mensajes

| Mensaje | De → a | Contenido | Validación en el servidor |
| --- | --- | --- | --- |
| `saludo` | cliente → servidor | versión del cliente y del motor, token de partida | Versión soportada, token firmado y vigente |
| `apuntar` | cliente → servidor → rival | ángulo | Solo en tu turno; máximo unas 10 por segundo; solo visual |
| `tirar` | cliente → servidor | ángulo, fuerza, punto de contacto, número de secuencia | Turno, rangos, secuencia sin repetir, reloj del servidor |
| `resultado` | servidor → ambos | estado final, bolas metidas, faltas, hash | — |

## Reconexión

La sala espera 60 s al jugador caído. Si vuelve, recibe el estado actual. Si
no, pierde por abandono, y quien abandona seguido recibe una penalización.

## Emparejamiento (fase 3)

Código: `apps/game-server/src/emparejamiento.ts`. Hay una cola por modo y sala.

| Regla | Valor |
| --- | --- |
| Rango de rating al entrar | ±100 |
| Crecimiento del rango | +10 por segundo de espera, hasta ±500 |
| Las dos partes aceptan | La diferencia debe caber en el rango de ambos |
| Región | Solo la misma durante 15 s; después cualquiera, prefiriendo la misma |
| Rival repetido | Ninguno de los últimos 3 hasta esperar 60 s |
| Prioridad | Primero quien más espera; se elige el rating más parecido |

## Ranking (fase 3)

Código: `apps/api/src/glicko2.ts` y `apps/api/src/ranking.ts`.

- Glicko-2 por modo con τ = 0,5. Empieza en 1500 ± 350.
- Cada partida clasificatoria es un período de un resultado; las amistosas no
  mueven el rating.
- El rating que se muestra es `r − 2·RD`: un jugador nuevo empieza en 800 y
  sube a medida que el sistema lo conoce.
- Tablas global y por país (desde 10 partidas) y de amigos (sin mínimo), con
  los 100 primeros.
