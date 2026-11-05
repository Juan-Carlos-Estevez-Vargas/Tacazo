# 0001. Partir de la plantilla de proyectos

- **Estado:** Aceptada
- **Fecha:** 2026-11-05

## Contexto

Cada proyecto necesita lo mismo antes de su primera línea de código: CI,
búsqueda de secretos, análisis de seguridad, plantillas de PR e issues,
documentación y diagramas. Hacerlo a mano en cada repo toma tiempo y deja
huecos distintos en cada uno.

## Decisión

Todo repo nuevo se crea desde
[plantilla-proyectos](https://github.com/Juan-Carlos-Estevez-Vargas/plantilla-proyectos)
y se inicia con `scripts/iniciar-proyecto.mjs`.

## Alternativas descartadas

- **Copiar archivos de otro proyecto:** arrastra configuraciones que no
  aplican y se olvidan piezas.
- **Generador con dependencias (Yeoman, cookiecutter):** pide instalar algo
  más; la plantilla de GitHub y un script de Node bastan.

## Consecuencias

- Todos los proyectos comparten la misma base y se revisan igual.
- Los cambios en la plantilla no llegan solos a los repos ya creados: se
  copian a mano siguiendo las notas del release.
