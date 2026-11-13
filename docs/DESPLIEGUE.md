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
| `TACAZO_ALERTAS_WEBHOOK` | API, servidor de partidas y secreto de GitHub | no | Webhook de Discord o Slack para los avisos de errores y caídas; sin él, los errores solo quedan en el log |
| `TACAZO_URL_API` y `TACAZO_URL_PARTIDAS` | Variables del repo en GitHub | sí | URLs públicas que vigila [vigilancia.yml](../.github/workflows/vigilancia.yml) |
| `PUERTO` | API (3000) y servidor de partidas (2567) | sí | Puerto HTTP |
| AdSense | Cliente (`meta tacazo-adsense` = `ca-pub-…` y `meta tacazo-adsense-slot` = id del bloque) | sí | Tarjeta de anuncio en menús; sin ellas no hay anuncios |
| Verificación de AdMob | Consola de AdMob, en el bloque con premio | sí | URL `https://<api>/anuncios/admob` para la verificación del lado del servidor |

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

## Monitoreo

- **Salud.** `GET /salud` en la API hace `SELECT 1` y responde 503 si la base
  no contesta. En el servidor de partidas devuelve además las salas abiertas,
  los jugadores en cola, la memoria y el tiempo encendido.
- **Vigilancia.** [vigilancia.yml](../.github/workflows/vigilancia.yml) pide
  `/salud` a los dos servicios cada 10 minutos. Si uno falla o tarda más de
  3 s, el flujo queda en rojo (GitHub avisa por correo) y manda un mensaje al
  webhook. Se puede correr a mano desde la pestaña Actions.
- **Errores.** Los 500 de la API, los fallos al cobrar, devolver o pagar
  monedas y los errores sin atrapar salen en el log como una línea JSON
  (`"nivel":"error"`) y van al webhook. El mismo error se avisa una vez cada
  10 minutos y como mucho 20 avisos por hora. Un error sin atrapar reinicia el
  proceso, así que el proveedor tiene que reiniciarlo solo.

## Volver a la versión anterior

Cada despliegue sale de una etiqueta `vX.Y.Z`, así que volver es desplegar la
etiqueta anterior.

1. **Cliente.** En el proveedor del sitio estático, volver al despliegue
   anterior (casi todos tienen un botón). Si no, `git checkout vX.Y.Z`,
   `pnpm --filter @tacazo/client build` y subir `apps/client/dist`.
2. **API y servidor de partidas.** Desplegar la etiqueta anterior. Si entre las
   dos versiones cambió `PROTOCOLO` o `ENGINE_VERSION`, hay que volver el
   cliente al mismo tiempo: el servidor rechaza clientes de otra versión.
3. **Servidor de partidas.** Las salas viven en memoria; reiniciarlo corta las
   partidas en curso. Las entradas que queden sin liquidar se devuelven solas
   unas 3 horas después (el servidor lo revisa al arrancar y cada hora).
   Mejor hacerlo en la hora con menos jugadores.
4. **Base de datos.** Las migraciones solo van hacia adelante y no se editan.
   Una migración mala se corrige con otra nueva. Si se dañaron datos, se
   restaura como dice la sección siguiente.
5. Anotar qué pasó y por qué en el [CHANGELOG](../CHANGELOG.md).

## Copias de seguridad

- **Qué:** toda la base de Neon (jugadores, partidas, monedas, moderación). El
  código está en git y los secretos en el proveedor; no hace falta copiarlos.
- **Cada cuánto:** Neon guarda el historial continuo de la base (restauración
  a cualquier momento dentro de la ventana de historial; en el plan gratuito
  son pocas horas, en los de pago hasta 30 días). Además, una copia lógica
  semanal fuera de Neon, cifrada:

  ```bash
  pg_dump -Fc "$DATABASE_URL" | age -r <clave-pública> > tacazo-AAAA-MM-DD.dump.age
  ```

  Se guardan las últimas 8 en un lugar distinto de Neon (por ejemplo un bucket
  privado). Tienen datos personales: nunca en el repo ni en artefactos
  públicos.
- **Cómo se restaura:**
  1. En Neon, crear una rama desde el momento anterior al daño (Branches →
     Create branch → *Past data*), o restaurar el dump en una base vacía con
     `pg_restore -d <base-vacía> --no-owner tacazo.dump`.
  2. Revisar la copia antes de usarla:

     ```bash
     DATABASE_URL=<copia> ORIGEN_URL=<producción> pnpm --filter @tacazo/api comprobar-copia
     ```

     Mira que estén todas las migraciones y tablas, que cada movimiento de
     monedas sume cero, que nadie quede con saldo negativo y que la copia no
     tenga más filas que el origen. Sale con 1 si algo no cuadra.
  3. Si pasa, apuntar `DATABASE_URL` de la API y del servidor de partidas a la
     rama restaurada (o promoverla a principal en Neon) y reiniciarlos.
- **Simulacro:** una vez al mes, restaurar en una rama de prueba y correr
  `comprobar-copia`. Una copia que nunca se probó no cuenta como copia.
