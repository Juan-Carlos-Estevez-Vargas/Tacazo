# Guía de contribución

¡Gracias por tu interés! Los cambios grandes conviene conversarlos primero en
un issue. Al participar aceptas el [código de conducta](CODE_OF_CONDUCT.md).

## Reportar errores o proponer ideas

- Busca antes en los [issues](https://github.com/Juan-Carlos-Estevez-Vargas/NOMBRE-DEL-REPO/issues) para no duplicar.
- Usa la plantilla que corresponda (error o mejora).
- Las vulnerabilidades **no** van en issues: sigue la [política de seguridad](SECURITY.md).

## Flujo de trabajo

1. Crea una rama corta desde la rama principal: `feat/...`, `fix/...`, `docs/...`.
2. Haz cambios pequeños y enfocados.
3. Corre las pruebas y el build en local, más las revisiones de la base:
   ```bash
   node scripts/check-secrets.mjs
   node scripts/check-links.mjs
   node --test "scripts/*.test.mjs"
   ```
4. Actualiza en el mismo PR los diagramas afectados (`docs/DIAGRAMAS.md`),
   el README y, si es una decisión importante, su ADR en `docs/adr/`.
5. Abre el PR, completa la plantilla y espera CI en verde.
6. Se fusiona con **squash merge**: un commit limpio por PR.

## Mensajes de commit

[Conventional Commits](https://www.conventionalcommits.org/es/):
`<tipo>(<ámbito opcional>): <descripción en minúsculas>`.

| Tipo | Cuándo | Efecto en la versión |
| --- | --- | --- |
| `feat` | Funcionalidad nueva | Sube la versión menor |
| `fix` | Corrección de un error | Sube el parche |
| `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore` | Lo demás | Sube el parche |
| `feat!` o `BREAKING CHANGE:` | Cambio incompatible | Sube la versión mayor |

## Reglas que no se negocian

- Nada de claves ni datos personales en el repo: van en `.env` (ignorado) o
  en los secretos del proveedor. CI revisa también el historial.
- Toda entrada del usuario se valida en el servidor y las consultas a la base
  van siempre parametrizadas.
- Cada cambio de base de datos es una migración nueva, con fecha posterior a
  las ya fusionadas.
- Interfaz accesible: etiquetas en los campos, foco visible, `alt` en las
  imágenes y nada que dependa solo del color.
- Interfaz en varios idiomas: ningún texto visible escrito a mano en el código;
  cada texto nuevo va en todos los diccionarios (ver [docs/IDIOMAS.md](docs/IDIOMAS.md)).
