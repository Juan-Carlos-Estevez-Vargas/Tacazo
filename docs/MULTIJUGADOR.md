# Multijugador

El billar es por turnos: el cliente manda la **intención del tiro** y el
servidor decide qué pasó. El ciclo está en
[DIAGRAMAS.md](DIAGRAMAS.md#ciclo-de-un-tiro).

## Servidor

`apps/game-server` usa Node `http` y `ws`, sin Colyseus
([ADR 0003](adr/0003-websocket-sin-colyseus.md)).

| Ruta | Qué hace |
| --- | --- |
| `GET /salud` | Responde `{ ok: true }` para el monitoreo |
| `POST /salas` | Crea una sala con el nombre del anfitrión y devuelve su token |
| `POST /salas/:id/unirse` | Sienta al segundo jugador y devuelve su token |
| `GET /salas/:id/repeticion` | Repetición de la partida, verificable con el motor |
| `WS /ws` | Conexión de juego; el primer mensaje debe ser `saludo` |

Variables de entorno:

| Variable | Qué es |
| --- | --- |
| `TACAZO_SECRETO` | Clave para firmar los tokens. Obligatoria en producción (32 bytes al azar) |
| `TACAZO_ORIGENES` | Orígenes permitidos separados por comas, por ejemplo `https://tacazo.app` |
| `PUERTO` | Puerto HTTP y WebSocket (2567 por defecto) |

Para probar en local:

```bash
pnpm --filter @tacazo/game-server dev   # servidor en :2567
pnpm --filter @tacazo/client dev        # cliente en :5173
```

## Mensajes

Los tipos están en `packages/core/src/protocolo.ts`. Cada mensaje es JSON con
un campo `t` y no puede pasar de 4 KB.

| Mensaje | De → a | Contenido | Validación en el servidor |
| --- | --- | --- | --- |
| `saludo` | cliente → servidor | token, versión del cliente y del motor | Llega en menos de 5 s, token firmado y vigente, mismo `ENGINE_VERSION` |
| `apuntar` | cliente → servidor → rival | ángulo | Solo en tu turno; solo visual |
| `tirar` | cliente → servidor | tiro, secuencia, tronera cantada, posición de la blanca | Turno, rangos, secuencia mayor que la anterior, bola en mano válida |
| `bienvenida` | servidor → cliente | silla y estado completo | — |
| `resultado` | servidor → ambos | tiro, veredicto, hash y estado final | — |
| `tiempo` | servidor → ambos | quién perdió el turno por reloj | — |
| `estado` | servidor → ambos | estado completo (llegada o salida de un jugador) | — |
| `rechazo` | servidor → cliente | motivo de un tiro inválido | 20 rechazos cierran la conexión |
| `error` | servidor → cliente | `version`, `token`, `sala` o `abuso` | Va seguido del cierre |

Códigos de cierre: 4000 te conectaste desde otro lugar, 4001 token o saludo,
4002 versión vieja, 4003 mensaje binario, 4004 sala inexistente o sin silla,
4008 demasiados mensajes. Cada conexión tiene una cubeta de 20 mensajes por
segundo con ráfagas de 40, y la creación de salas se limita a 20 por minuto
por IP.

## Reloj y reconexión

- Cada turno dura 30 s en el reloj del servidor. Si se acaba, es falta por
  tiempo y el rival recibe bola en mano.
- La sala espera 60 s al jugador caído. Si vuelve (el cliente reintenta con
  espera creciente y guarda su silla en `sessionStorage`), recibe el estado
  actual. Si no, pierde por abandono.

## Repeticiones

Cada partida guarda la semilla, los tiros, las faltas por tiempo y los
abandonos. `verificarRepeticion` (en `packages/core/src/repeticion.ts`) vuelve
a simular todo y compara el hash de cada tiro: si alguien cambia un número, la
repetición no pasa. Al terminar una partida el cliente ofrece **Ver
repetición**.

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

### Cómo se entra a la cola

1. El cliente obtiene su invitado de la API (`POST /invitados`, con Turnstile)
   y pide un token corto para jugar (`POST /sesion-juego`, 2 horas).
2. `POST /cola` al servidor de partidas con `{ modo: "bola8", sala: "barrio" }`
   y `Authorization: Bearer <token>`. El servidor lee el rating, la región, los
   últimos 3 rivales y las sanciones del jugador en la base.
3. El cliente pregunta con `GET /cola` cada 1,5 s. Quien deja de preguntar 10 s
   sale de la cola. `DELETE /cola` cancela.
4. Cada segundo el servidor forma parejas, crea la sala y responde
   `emparejado` con la sala, la silla y el token de partida. Desde ahí sigue
   igual que una partida con amigo.
5. Al terminar, la partida y su repetición se guardan como clasificatoria y
   se actualiza el rating de los dos.

Sin `DATABASE_URL` el servidor funciona igual, pero solo con partidas con amigos.
Quien tiene una sanción de nivel 2 o más no entra a la cola.

## Ranking (fase 3)

Código: `apps/api/src/glicko2.ts` y `apps/api/src/ranking.ts`.

- Glicko-2 por modo con τ = 0,5. Empieza en 1500 ± 350.
- Cada partida clasificatoria es un período de un resultado; las amistosas no
  mueven el rating.
- El rating que se muestra es `r − 2·RD`: un jugador nuevo empieza en 800 y
  sube a medida que el sistema lo conoce.
- Tablas global y por país (desde 10 partidas) y de amigos (sin mínimo), con
  los 100 primeros.
