# 0003. Servidor de partidas con `ws`, sin Colyseus

- **Estado:** Aceptada
- **Fecha:** 2026-11-05

## Contexto

El plan proponía Colyseus para las salas. Al escribir la fase 2 quedó claro
que el billar casi no necesita lo que Colyseus ofrece: es por turnos, se
manda un mensaje por tiro y el estado completo de la mesa cabe en unos pocos
cientos de bytes. La sincronización de estado por diferencias de Colyseus
sirve para juegos en tiempo real, no para este. Además su esquema de estado
exige clases con decoradores que no encajan con el motor de `packages/core`,
que trabaja con objetos simples.

## Decisión

El servidor (`apps/game-server`) usa Node `http` y `ws` 8 directamente:

- Mensajes JSON tipados en `packages/core/src/protocolo.ts`, validados con
  una función estricta en el servidor.
- La clase `Sala` es independiente de la red y recibe un reloj inyectado,
  así las pruebas cubren turnos, tiempos y abandonos sin esperar de verdad.
- Token de partida firmado con HMAC-SHA256, número de secuencia por tiro,
  límite de mensajes por conexión y lista de orígenes permitidos.

## Alternativas descartadas

- **Colyseus:** agrega una dependencia grande y un modelo de estado que aquí
  no se usa. Si más adelante hace falta escalar a varias máquinas, la sala ya
  está separada de la red y se puede mover.
- **Socket.IO:** su protocolo propio y los reintentos por HTTP largo no
  aportan nada frente a WebSocket, que ya soportan todos los navegadores
  objetivo.

## Consecuencias

- Menos dependencias y un protocolo que se lee en un solo archivo.
- La reconexión, el latido y el cierre por abuso se escriben a mano; las
  pruebas de integración en `servidor.test.ts` los cubren.
- Para varias máquinas habrá que guardar las salas en Redis o fijar a cada
  jugador a una máquina (fase 3 o 5).
