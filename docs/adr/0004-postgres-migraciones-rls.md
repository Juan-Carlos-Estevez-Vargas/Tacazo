# 0004. PostgreSQL con migraciones SQL y seguridad por fila

- **Estado:** Aceptada
- **Fecha:** 2026-11-05

## Contexto

La fase 3 necesita guardar jugadores, ratings, partidas y amistades. El plan
ya elegía PostgreSQL (Neon). Faltaba decidir cómo versionar el esquema y cómo
evitar que un error en la API deje a un jugador leer o cambiar datos ajenos.

## Decisión

- **Migraciones en SQL plano**, en `apps/api/migraciones/`, con nombre
  `AAAAMMDD_NN_descripcion.sql`. Un migrador corto (`apps/api/src/migrar.ts`)
  las aplica en orden, cada una en su transacción, y guarda su huella SHA-256.
  Si una migración ya aplicada cambia, o llega una con fecha anterior a la
  última, se detiene.
- **Seguridad por fila (RLS)** en todas las tablas. La conexión entra con el
  usuario dueño, y cada petición corre en una transacción con
  `SET LOCAL ROLE tacazo_api` y `app.jugador` fijado al jugador de la sesión.
  El servidor de partidas usa `tacazo_partidas`, el único que escribe
  partidas y ratings.
- **Pruebas** con PGlite (PostgreSQL en WebAssembly, en memoria), así CI no
  necesita un servidor. Con `TACAZO_PG_PRUEBA` corren contra un PostgreSQL 16
  real; así se probó también.

## Alternativas descartadas

- **ORM con migraciones generadas (Prisma, Drizzle):** esconden el SQL de las
  políticas RLS y agregan dependencias grandes.
- **Supabase:** trae auth y RLS listos, pero ata la API a su cliente y cambia
  el proveedor elegido en el plan.
- **Permisos solo en el código de la API:** un `WHERE` olvidado basta para
  mostrar datos ajenos; con RLS la base lo impide igual.

## Consecuencias

- Montar la base desde cero es `DATABASE_URL=... pnpm --filter @tacazo/api migrar`.
- El usuario dueño necesita poder crear roles (en Neon lo tiene el usuario por
  defecto).
- Cada consulta nueva de la API debe ir dentro de `comoJugador`.
