# Despliegue

## Requisitos

- Node 22 y pnpm.
- Un proyecto de Neon con PostgreSQL 16 y Neon Auth (Google y correo).
- Un sitio de Cloudflare Turnstile para crear invitados.
- Un servidor para `apps/game-server` (WebSocket) y otro para `apps/api`.

## Variables de entorno

| Variable | Dónde va | Pública | Para qué |
| --- | --- | --- | --- |
| `DATABASE_URL` | API, servidor de partidas y trabajo nocturno | no | Conexión a PostgreSQL (Neon) con el usuario dueño |
| `NEON_AUTH_URL` | API y cliente | sí | URL de Neon Auth, por ejemplo `https://ep-x.aws.neon.tech/neondb/auth` |
| `TACAZO_SECRETO` | API y servidor de partidas | no | Firma tokens de invitado y de partida. 32 bytes al azar; **el mismo** en la API y el servidor de partidas |
| `TURNSTILE_SECRETO` | API | no | Clave secreta de Turnstile; obligatoria en producción |
| `TURNSTILE_SITIO` | Cliente (`meta tacazo-turnstile`) | sí | Clave pública de Turnstile |
| URL de la API y del servidor | Cliente (`meta tacazo-api` y `meta tacazo-servidor`) | sí | Sin ellas, el cliente usa los puertos 3000 y 2567 del mismo host |
| `TACAZO_ORIGENES` | API y servidor de partidas | sí | Orígenes permitidos (CORS y WebSocket), separados por comas |
| `TACAZO_UMBRALES` | Trabajo nocturno | no | Umbrales anti-trampas en JSON ([MODERACION.md](MODERACION.md)) |
| `PUERTO` | API (3000) y servidor de partidas (2567) | sí | Puerto HTTP |

Las privadas van solo en los secretos del proveedor o de GitHub, nunca en el
repo ni en variables que lleguen al navegador.

## Montarlo desde cero

1. Crear el proyecto en Neon y activar Neon Auth con Google y correo.
2. `DATABASE_URL=... pnpm --filter @tacazo/api migrar` para crear las tablas,
   los roles y la seguridad por fila.
3. Poner las variables de arriba en el proveedor de cada servicio.
4. `pnpm -r build` y arrancar `apps/api` y `apps/game-server` con `pnpm start`.
5. Programar `pnpm --filter @tacazo/api senales` una vez por noche.
6. Revisar cada semana `pnpm --filter @tacazo/api monedas 7` (fuentes y
   sumideros de monedas, ver [ECONOMIA.md](ECONOMIA.md)).

## Versiones

Se sigue [SemVer](https://semver.org/lang/es/) a partir de los commits
(ver [CONTRIBUTING.md](../CONTRIBUTING.md#mensajes-de-commit)). Después de
cada despliegue:

```bash
git tag v1.2.0
git push origin v1.2.0
```

El flujo `release.yml` publica el release con las notas agrupadas; luego se
pasa el resumen al [CHANGELOG](../CHANGELOG.md). Diagrama en
[DIAGRAMAS.md](DIAGRAMAS.md#versiones-y-releases).

## Volver a la versión anterior

Cómo regresar al despliegue anterior si algo falla.

## Copias de seguridad

Qué se respalda, cada cuánto y cómo se restaura.
