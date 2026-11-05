# 0002. Monorepo TypeScript con motor compartido

- **Estado:** Aceptada
- **Fecha:** 2026-11-05

## Contexto

En un juego en línea el cliente está en manos del jugador, así que no se le
puede creer. El servidor debe simular cada tiro, y el cliente necesita la
misma simulación para animar sin esperar. Si cada lado tiene su propia
física, tarde o temprano dan resultados distintos.

## Decisión

Un monorepo con pnpm workspaces y TypeScript `strict`. La física y las reglas
viven en `packages/core`, sin dependencias, y las usan el cliente, el servidor
de partidas y el bot. El lint prohíbe en `core` `Math.random`, el reloj y las
APIs del navegador, para que el motor sea determinista.

## Alternativas descartadas

- **Servidor en otro lenguaje (Go, C#):** obliga a escribir la física dos
  veces y a mantenerlas iguales.
- **Motor de juego completo (Unity, Godot):** pesa más en la web y aleja el
  proyecto del stack y la plantilla que ya se usan.

## Consecuencias

- Un cambio de física sube `ENGINE_VERSION` y el servidor rechaza clientes
  con otra versión.
- Los tiros dorados (fase 1) prueban que el resultado no cambia sin querer.
