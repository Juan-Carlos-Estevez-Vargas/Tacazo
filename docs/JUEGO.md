# Juego

Tacazo es billar 1 contra 1 en tiempo real. Este documento dice qué modos hay,
cómo se juega cada uno y en qué fase llega.

## Modos

| Modo | Mesa | Fase | Estado |
| --- | --- | --- | --- |
| Bola 8 | Pool de 9 pies, 6 troneras | 1 | Jugable contra el bot, sin conexión |
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
sus pruebas.

### Bola 8

Código: `packages/core/src/reglas/bola8.ts`. Pruebas: `bola8.test.ts`, una por
falta. Las reglas no simulan nada: reciben los eventos de la física (choques,
bandas, troneras) y deciden faltas, turno y ganador.

| Situación | Qué pasa |
| --- | --- |
| Saque | Blanca en la cabecera. Es legal si cae una bola o al menos 4 bolas tocan banda. Después del saque la mesa sigue abierta |
| Saque ilegal o blanca en tronera en el saque | Turno al rival con bola en mano detrás de la línea de cabecera |
| La 8 cae en el saque | Vuelve al punto de pie; no se pierde |
| Mesa abierta | Se puede tocar primero cualquier bola menos la 8. La primera bola metida sin falta decide el grupo (lisas 1-7 o rayadas 9-15) |
| Sigue tirando | Si mete una de su grupo sin falta |
| Faltas | Blanca en tronera, no tocar ninguna bola, tocar primero una bola que no es suya, o que tras el contacto nada caiga ni toque banda |
| Después de una falta | Turno al rival con bola en mano en cualquier lugar |
| La 8 | Cuando ya no quedan bolas de su grupo. Hay que cantar la tronera |
| Gana | Mete la 8 en la tronera cantada sin falta |
| Pierde | Mete la 8 antes de tiempo, en otra tronera, sin cantar o con falta |

### Jugar en el navegador

`pnpm --filter @tacazo/client dev` abre una partida de práctica contra el bot.

| Acción | Cómo |
| --- | --- |
| Apuntar | Mover el ratón o arrastrar el dedo sobre la mesa. Flechas ← → para afinar (con Mayús, más fino) |
| Tirar | Arrastrar la barra de potencia y soltar |
| Efecto | Tocar en la bola pequeña dónde le pega el taco; doble toque vuelve al centro |
| Curva | Subir la inclinación del taco y poner efecto lateral |
| Bola en mano | Arrastrar la blanca; detrás de la línea en el saque |
| Cantar la 8 | Tocar la tronera; queda marcada en latón |

En pantallas verticales la mesa gira y la cabecera queda abajo. Los sonidos se
sintetizan con Web Audio a partir de la velocidad de cada choque, y con
"reducir movimiento" no sale el polvo de tiza.

### Bot de práctica

Código: `packages/core/src/bot.ts`. Busca tiros con la bola fantasma, simula
los candidatos con el mismo motor y elige el mejor según las reglas. Con bola
en mano deja la blanca detrás de un tiro recto.

| Nivel | Tiros que prueba | Error de puntería |
| --- | --- | --- |
| Fácil | 6 | ±2,5° |
| Medio | 18 | ±0,8° |
| Difícil | 40 | ±0,15° |

Es determinista: con la misma semilla juega igual. Las pruebas juegan partidas
enteras y comprueban que el difícil le gana al fácil.

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
