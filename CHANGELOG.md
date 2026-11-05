# Cambios

Historial de la plantilla. Sigue [SemVer](https://semver.org/lang/es/) y
[Conventional Commits](https://www.conventionalcommits.org/es/); las notas
completas de cada versión están en los
[releases](https://github.com/Juan-Carlos-Estevez-Vargas/plantilla-proyectos/releases).

Al crear un proyecto, `scripts/iniciar-proyecto.mjs` reemplaza este archivo
por uno vacío.

## [1.1.0] - 2026-11-05

### Novedades

- `scripts/iniciar-proyecto.mjs`: deja listo un repo nuevo en un solo comando
  (nombre en todos los archivos, README del proyecto, CHANGELOG limpio).
- `scripts/check-links.mjs` en CI: falla si un enlace o ancla interna de la
  documentación está rota.
- Pruebas de los scripts con `node --test`, también en CI.
- Release automático al subir un tag `vX.Y.Z`, con notas agrupadas
  (`.github/release.yml`).
- README propio de la plantilla; el del proyecto pasa a `.plantilla/README.md`.
- Código de conducta, CODEOWNERS, `.gitattributes`, extensiones recomendadas
  de VS Code y carpeta de decisiones (`docs/adr/`).
- Diagramas nuevos: uso de la plantilla y versiones; el de CI se actualiza.

## [1.0.0] - 2026-11-04

### Novedades

- Base de proyectos: README, LICENSE, SECURITY, CONTRIBUTING, plantillas de
  PR e issues, Dependabot, `.editorconfig` y `.env.example`.
- CI que detecta el stack, buscador de secretos sobre archivos e historial,
  CodeQL y OpenSSF Scorecard (se saltan en repos privados).
- Guía de idiomas y base de i18n para React + TypeScript.
- Ko-fi y botón Sponsor (`FUNDING.yml`).

[1.1.0]: https://github.com/Juan-Carlos-Estevez-Vargas/plantilla-proyectos/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Juan-Carlos-Estevez-Vargas/plantilla-proyectos/releases/tag/v1.0.0
