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

## Matchmaking y ranking (fase 3)

- Cola por modo, sala y región; el rango de rating aceptado se amplía con la
  espera; se evita repetir el mismo rival muchas veces seguidas.
- Glicko-2 por modo. Solo las clasificatorias mueven el rating.
