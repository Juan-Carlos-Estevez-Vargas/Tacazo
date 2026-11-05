# 0005. Cuentas con Neon Auth y jugadores invitados

- **Estado:** Aceptada
- **Fecha:** 2026-11-05

## Contexto

Para el ranking y la economía hace falta saber quién es quién, pero pedir una
cuenta antes de jugar espanta a la gente. El juego tiene que dejar jugar al
instante y guardar el progreso cuando el jugador quiera.

## Decisión

- **Invitado primero.** Al abrir el juego, la API crea un jugador y le da un
  token firmado con HMAC que dura un año. Turnstile de Cloudflare evita que un
  script cree miles de invitados.
- **Cuenta con Neon Auth** (Better Auth administrado por Neon), con Google y
  correo. La elegimos porque la base ya es Neon y no suma otra plataforma.
- **Vincular sin perder nada.** El cliente manda su token de invitado y el JWT
  de Neon Auth; la API verifica el JWT con el JWKS público (EdDSA) y le pone
  la cuenta a la misma fila de `jugadores`. Si la cuenta ya tenía jugador
  (otro aparato), se usa ese.
- Solo el rol `tacazo_cuentas` toca la columna `cuenta`; la API la usa
  únicamente para encontrar al jugador.

## Alternativas descartadas

- **Supabase Auth o Firebase Auth:** igual de capaces, pero agregan otra
  plataforma y otro lugar con datos de usuarios.
- **Auth propia:** más código sensible que mantener y auditar.

## Consecuencias

- El JWT dura 15 minutos; el cliente lo renueva con `authClient.token()`.
- Si se juega en dos aparatos como invitado y luego se inicia sesión en los
  dos, el progreso del segundo invitado no se fusiona (queda documentado; la
  fusión puede llegar después si hace falta).
- Hay que activar Neon Auth en el proyecto y configurar Google (tarea manual).
