# Despliegue

## Requisitos

## Variables de entorno

| Variable | Dónde va | Pública | Para qué |
| --- | --- | --- | --- |
| | | sí / no | |

Las privadas van solo en los secretos del proveedor o de GitHub, nunca en el
repo ni en variables que lleguen al navegador.

## Montarlo desde cero

1. 
2. 

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
