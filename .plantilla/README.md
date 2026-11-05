# NOMBRE DEL PROYECTO

**Una frase que diga qué es y para quién.**

[![CI](https://github.com/Juan-Carlos-Estevez-Vargas/NOMBRE-DEL-REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/Juan-Carlos-Estevez-Vargas/NOMBRE-DEL-REPO/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Juan-Carlos-Estevez-Vargas/NOMBRE-DEL-REPO/actions/workflows/codeql.yml/badge.svg)](https://github.com/Juan-Carlos-Estevez-Vargas/NOMBRE-DEL-REPO/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Juan-Carlos-Estevez-Vargas/NOMBRE-DEL-REPO/badge)](https://scorecard.dev/viewer/?uri=github.com/Juan-Carlos-Estevez-Vargas/NOMBRE-DEL-REPO)
[![Release](https://img.shields.io/github/v/release/Juan-Carlos-Estevez-Vargas/NOMBRE-DEL-REPO?label=versi%C3%B3n)](https://github.com/Juan-Carlos-Estevez-Vargas/NOMBRE-DEL-REPO/releases)
[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-blue)](LICENSE)
[![Invítame un café en Ko-fi](https://img.shields.io/badge/Ko--fi-Inv%C3%ADtame%20un%20caf%C3%A9-ff5e5b?logo=kofi&logoColor=white)](https://ko-fi.com/juancarlosestevezvargas)

> Repo creado desde la [plantilla de proyectos](https://github.com/Juan-Carlos-Estevez-Vargas/plantilla-proyectos).
> Sigue la lista de [Primeros pasos](#primeros-pasos-de-la-plantilla) y borra
> este aviso.

## Contenido

- [Descripción](#descripción)
- [Capturas](#capturas)
- [Funcionalidades](#funcionalidades)
- [Tecnologías](#tecnologías)
- [Inicio rápido](#inicio-rápido)
- [Scripts](#scripts)
- [Arquitectura](#arquitectura)
- [Seguridad y privacidad](#seguridad-y-privacidad)
- [Accesibilidad, idiomas y SEO](#accesibilidad-idiomas-y-seo)
- [Despliegue y versiones](#despliegue-y-versiones)
- [Documentación](#documentación)
- [Contribuir](#contribuir)
- [Apoyar el proyecto](#apoyar-el-proyecto)
- [Licencia](#licencia)

## Descripción

Qué problema resuelve, sus funciones principales y en qué estado está.

## Capturas

<!-- Imágenes en docs/capturas/ con texto alternativo descriptivo. -->

## Funcionalidades

| Área | Ruta | Acceso |
| --- | --- | --- |
| | | |

## Tecnologías

| Capa | Tecnología |
| --- | --- |
| Interfaz | |
| Backend | |
| Base de datos | |
| Pruebas | |
| Publicación | |

## Inicio rápido

```bash
# instalar dependencias
# copiar .env.example a .env y llenarlo
# correr en local
# correr las pruebas
```

## Scripts

| Comando | Qué hace |
| --- | --- |
| | |

## Arquitectura

Resumen de las capas y cómo se conectan. El detalle está en
[ARQUITECTURA.md](docs/ARQUITECTURA.md) y los diagramas en
[DIAGRAMAS.md](docs/DIAGRAMAS.md).

## Seguridad y privacidad

Qué protege la app y cómo (autenticación, permisos, cabeceras, secretos,
datos personales). Estado de cada punto en
[SEGURIDAD_OWASP.md](docs/SEGURIDAD_OWASP.md) y en [LEGAL.md](docs/LEGAL.md).

## Accesibilidad, idiomas y SEO

Nivel de accesibilidad que se busca (WCAG 2.2 AA), idiomas disponibles y cómo
se detecta el del navegador ([IDIOMAS.md](docs/IDIOMAS.md)), y qué páginas se
indexan.

## Despliegue y versiones

Dónde se publica, qué variables necesita y cómo se versiona. Paso a paso en
[DESPLIEGUE.md](docs/DESPLIEGUE.md). Cada versión es un tag `vX.Y.Z`: al
subirlo se publica el release con sus notas, y los cambios quedan en el
[CHANGELOG](CHANGELOG.md).

## Documentación

| Documento | Contenido |
| --- | --- |
| [Arquitectura](docs/ARQUITECTURA.md) | Piezas del sistema y cómo se conectan |
| [Diagramas](docs/DIAGRAMAS.md) | Diagramas en Mermaid de la arquitectura y de cada flujo |
| [Despliegue](docs/DESPLIEGUE.md) | Cómo montarlo desde cero y qué variables necesita |
| [Seguridad](docs/SEGURIDAD_OWASP.md) | Estado de cada punto de seguridad |
| [Legal](docs/LEGAL.md) | Privacidad, datos personales y licencias |
| [Idiomas](docs/IDIOMAS.md) | Cómo traducir la app: detección del idioma, selector y diccionarios |
| [Decisiones (ADR)](docs/adr/README.md) | Por qué se eligió cada pieza importante |
| [Cambios](CHANGELOG.md) | Historial de versiones |
| [Política de seguridad](SECURITY.md) | Cómo reportar una vulnerabilidad |

## Contribuir

Lee la [guía de contribución](CONTRIBUTING.md) y el
[código de conducta](CODE_OF_CONDUCT.md). Los commits siguen
[Conventional Commits](https://www.conventionalcommits.org/es/).

## Apoyar el proyecto

Si este proyecto te sirvió o aprendiste algo del código, puedes invitarme un
café:

<a href="https://ko-fi.com/juancarlosestevezvargas"><img src="https://img.shields.io/badge/Ko--fi-Inv%C3%ADtame%20un%20caf%C3%A9-ff5e5b?style=for-the-badge&logo=kofi&logoColor=white" alt="Invítame un café en Ko-fi"></a>

GitHub también muestra el botón **Sponsor** del repositorio
(`.github/FUNDING.yml`).

## Licencia

[MIT](LICENSE) © Juan Carlos Estevez Vargas

## Primeros pasos de la plantilla

- [ ] Reemplazar `NOMBRE-DEL-REPO` y `NOMBRE DEL PROYECTO` en todos los archivos (`node scripts/iniciar-proyecto.mjs` lo hace solo)
- [ ] Dejar en `.github/dependabot.yml` solo los ecosistemas que use el proyecto
- [ ] Ajustar los lenguajes de `.github/workflows/codeql.yml` (CodeQL y Scorecard solo corren en repos públicos; en uno privado se saltan solos)
- [ ] Cambiar el paso «Pruebas» de `.github/workflows/ci.yml` por el comando propio del proyecto cuando exista (por ejemplo `npm run check`)
- [ ] GitHub → Settings → General: permitir solo *squash merge* y borrar ramas al fusionar
- [ ] GitHub → Settings → Rules: proteger la rama principal (PR obligatorio, CI en verde, sin force push)
- [ ] GitHub → Settings → Code security: Secret scanning, Push protection, Dependabot alerts y Private vulnerability reporting
- [ ] GitHub → página del repo → ⚙️ junto a *About*: descripción, sitio web y temas (topics)
- [ ] GitHub → Settings → General → Social preview: imagen de 1280×640
- [ ] Si la app tiene interfaz: montar los idiomas con [docs/IDIOMAS.md](docs/IDIOMAS.md) (en React + TypeScript, copiar `extras/i18n-react/`); si no, borrar `extras/` y esa guía
- [ ] Llenar o borrar las secciones del README que no apliquen (Funcionalidades, Scripts…)
- [ ] Si la app tiene interfaz y quieres el botón «Invítame un café», usar el mismo enlace de Ko-fi (`https://ko-fi.com/juancarlosestevezvargas`); `.github/FUNDING.yml` ya lo trae
- [ ] Anotar las primeras decisiones en `docs/adr/` (stack, base de datos, hosting)
- [ ] Publicar la primera versión: `git tag v0.1.0 && git push origin v0.1.0`
- [ ] Borrar esta sección
