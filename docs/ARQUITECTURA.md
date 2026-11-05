# Arquitectura

## 1. Visión general

Qué hace el sistema y cuáles son sus piezas principales. El diagrama está en
[DIAGRAMAS.md](DIAGRAMAS.md#arquitectura-general).

## 2. Tecnologías y por qué

| Pieza | Tecnología | Por qué |
| --- | --- | --- |
| | | |

## 3. Estructura de carpetas

```
src/        código de la aplicación
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
