# Decisiones de arquitectura (ADR)

Un archivo corto por cada decisión importante: qué se decidió, por qué y qué
se descartó. Así, dentro de un año, se entiende por qué el proyecto es como es.

## Cómo agregar una

1. Copia [0000-plantilla.md](0000-plantilla.md) como `NNNN-titulo-corto.md`
   con el siguiente número.
2. Llénala y súbela en el mismo PR del cambio.
3. Agrégala a la lista de abajo.
4. Una decisión no se borra: si cambia, se escribe una nueva y la vieja queda
   como «Reemplazada por NNNN».

## Lista

| N.º | Decisión | Estado |
| --- | --- | --- |
| [0001](0001-partir-de-la-plantilla.md) | Partir de la plantilla de proyectos | Aceptada |
| [0002](0002-monorepo-typescript.md) | Monorepo TypeScript con motor compartido | Aceptada |
| [0003](0003-websocket-sin-colyseus.md) | Servidor de partidas con `ws`, sin Colyseus | Aceptada |
| [0004](0004-postgres-migraciones-rls.md) | PostgreSQL con migraciones SQL y seguridad por fila | Aceptada |
