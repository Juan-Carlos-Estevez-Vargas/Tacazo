# Juego

Tacazo es billar 1 contra 1 en tiempo real. Este documento dice qué modos hay,
cómo se juega cada uno y en qué fase llega.

## Modos

| Modo | Mesa | Fase | Estado |
| --- | --- | --- | --- |
| Bola 8 | Pool de 9 pies, 6 troneras | 1 | Por hacer |
| Bola 9 | Pool de 9 pies | 7 | Por hacer |
| Bola 10 | Pool de 9 pies | 7 | Por hacer |
| Carambola libre | Carambola de 2,84 m, sin troneras | 8 | Por hacer |
| Carambola a una banda | Carambola | 8 | Por hacer |
| Carambola a 3 bandas | Carambola | 8 | Por hacer |
| Snooker | Snooker de 12 pies, troneras estrechas | 8 | Por hacer |

Cada modo es una mesa (`TableSpec` en `packages/core`), un juego de bolas y un
motor de reglas propio. El rating y las salas son por modo.

## Formas de jugar

| Forma | Cuesta monedas | Mueve el rating |
| --- | --- | --- |
| Práctica contra bot (3 niveles) | No | No |
| Partida con amigo por enlace | No | No |
| Clasificatoria por sala | Sí, la entrada de la sala | Sí |
| Torneo (fase 7) | Sí | No; tiene su propio premio |

## Reglas

Las reglas se escriben aquí cuando se implementa cada modo, con un enlace a
sus pruebas. Bola 8 llega con #14.

## Turno

- El reloj de turno vive en el servidor: 30 s.
- Si alguien se desconecta, la sala lo espera 60 s; después pierde por abandono.

## Estudio de referencia del género

Para que Tacazo se sienta familiar, el género se estudia **jugando y
observando** al menos cinco juegos de billar en línea (#9). No se descompila
ningún juego, no se captura su tráfico y no se copian su arte, sonidos, textos,
pantallas ni valores internos.

| Qué esperan los jugadores | Visto en | Cómo lo resuelve Tacazo |
| --- | --- | --- |
| | | |
