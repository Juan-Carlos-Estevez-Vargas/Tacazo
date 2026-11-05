# Arquitectura

## 1. Visión general

Tacazo es un juego de billar 1 contra 1 en tiempo real. Un paquete `core`
con la física y las reglas es compartido por el cliente, el servidor de
partidas y el bot, así el servidor puede simular cada tiro y tener la última
palabra. El diagrama está en
[DIAGRAMAS.md](DIAGRAMAS.md#arquitectura-general).

## 2. Tecnologías y por qué

| Pieza | Tecnología | Por qué |
| --- | --- | --- |
| Monorepo | pnpm workspaces + TypeScript `strict` | Un solo lenguaje y tipos compartidos entre cliente y servidor ([ADR 0002](adr/0002-monorepo-typescript.md)) |
| Motor y reglas | `packages/core`, sin dependencias | Determinista: el lint prohíbe `Math.random`, el reloj y las APIs del navegador |
| Cliente | Vite + PixiJS (fase 1) | 60 fps en celulares de gama media |
| Servidor de partidas | Node.js + `ws` (fase 2) | Salas por turnos con autoridad del servidor ([ADR 0003](adr/0003-websocket-sin-colyseus.md)) |
| API | Node.js + Fastify + Zod (fase 3) | Cuentas, ranking y economía separados de las partidas |
| Pruebas | Vitest | Rápido y con el mismo TypeScript |

## 3. Estructura de carpetas

```
packages/core/      física, mesas como datos, reglas y tipos de mensajes
apps/client/        juego y menús (Vite)
apps/game-server/   salas autoritativas
apps/api/           cuentas, ranking y economía
apps/bot/           IA de práctica y pruebas de carga
docs/       documentación, diagramas y decisiones (adr/)
extras/     piezas opcionales para copiar (i18n-react: base de idiomas)
scripts/    utilidades de CI y mantenimiento, con sus pruebas
.github/    CI, CodeQL, Scorecard, release, Dependabot, CODEOWNERS y plantillas
```

## 4. Capas

Interfaz, lógica de dominio y acceso a datos separados; la interfaz no habla
directo con la base de datos.

## 5. Idiomas

La app arranca en el idioma del dispositivo, se cambia con el selector 🌐 y
recuerda la elección. Los textos salen de diccionarios tipados (el idioma base
define el tipo). Las reglas y la estructura están en [IDIOMAS.md](IDIOMAS.md).

## 6. Seguridad

Resumen y enlace a [SEGURIDAD_OWASP.md](SEGURIDAD_OWASP.md).

Las decisiones importantes (stack, base de datos, hosting) tienen su ADR en
[adr/](adr/README.md).

## 7. Integración y despliegue continuos

- **CI** (`.github/workflows/ci.yml`): secretos, enlaces de la documentación, pruebas de los scripts, pruebas del proyecto, auditoría de dependencias y build en cada push y PR.
- **CodeQL** (`.github/workflows/codeql.yml`): análisis de seguridad del código en cada PR y cada semana.
- **Scorecard** (`.github/workflows/scorecard.yml`): puntaje de prácticas del repo en cada merge y cada semana.
- **Release** (`.github/workflows/release.yml`): publica el release con notas automáticas al subir un tag `vX.Y.Z`.

El camino completo está en [DIAGRAMAS.md](DIAGRAMAS.md#integración-y-despliegue).
