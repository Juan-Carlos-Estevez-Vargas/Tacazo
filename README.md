# Tacazo

**Billar en línea 1 contra 1, gratis, con física de verdad: pool, carambola y snooker en el navegador y el celular.**

[![CI](https://github.com/Juan-Carlos-Estevez-Vargas/Tacazo/actions/workflows/ci.yml/badge.svg)](https://github.com/Juan-Carlos-Estevez-Vargas/Tacazo/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Juan-Carlos-Estevez-Vargas/Tacazo/actions/workflows/codeql.yml/badge.svg)](https://github.com/Juan-Carlos-Estevez-Vargas/Tacazo/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Juan-Carlos-Estevez-Vargas/Tacazo/badge)](https://scorecard.dev/viewer/?uri=github.com/Juan-Carlos-Estevez-Vargas/Tacazo)
[![Release](https://img.shields.io/github/v/release/Juan-Carlos-Estevez-Vargas/Tacazo?label=versi%C3%B3n)](https://github.com/Juan-Carlos-Estevez-Vargas/Tacazo/releases)
[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-blue)](LICENSE)
[![Invítame un café en Ko-fi](https://img.shields.io/badge/Ko--fi-Inv%C3%ADtame%20un%20caf%C3%A9-ff5e5b?logo=kofi&logoColor=white)](https://ko-fi.com/juancarlosestevezvargas)

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

Tacazo es un juego de billar en línea para jugar 1 contra 1 en tiempo real,
gratis, desde el navegador y el celular. El servidor decide cada tiro con un
motor de física determinista, así que el resultado no se puede falsear desde
el cliente.

**Estado:** fase 0 (marca y fundaciones). El plan completo, de la fase 0 a la
10, está en los [hitos del repo](https://github.com/Juan-Carlos-Estevez-Vargas/Tacazo/milestones).

Tacazo es un juego original. No usa nombre, arte, sonidos, textos ni pantallas
de otros juegos; las reglas del billar son de dominio público.

## Capturas

<!-- Imágenes en docs/capturas/ con texto alternativo descriptivo. -->

## Funcionalidades

| Área | Qué incluye | Fase |
| --- | --- | --- |
| Juego base | Motor de física con efecto, bola 8, práctica contra bot | 1 |
| En línea | Partida con amigo por enlace, reconexión, repeticiones | 2 |
| Competitivo | Cuentas, matchmaking, ranking Glicko-2, anti-trampas | 3 |
| Economía gratis | Monedas que se ganan jugando, salas por nivel, anuncios discretos y anuncio con premio | 4 |
| Lanzamiento | Web, Play Store y App Store, versión 1.0.0 | 6 |
| Más pool | Bola 9, bola 10, torneos, temporadas, clubes | 7 |
| Nuevas mesas | Carambola libre, a una banda y 3 bandas; snooker | 8 |
| Más adelante | Vista 3D, salto y massé; tienda con dinero real | 9 y 10 |

## Tecnologías

| Capa | Tecnología |
| --- | --- |
| Motor y reglas | TypeScript (`packages/core`), sin dependencias del navegador |
| Interfaz | Vite + TypeScript + PixiJS; React solo para menús |
| Servidor de partidas | Node.js + `ws` (WebSocket, salas autoritativas) |
| API | Node.js + Fastify + Zod |
| Base de datos | PostgreSQL (Neon) y Redis |
| Pruebas | Vitest, Playwright, k6 con bots |
| Publicación | Web (PWA) y Capacitor para Android e iOS |

## Inicio rápido

Requisitos: Node 22 (`.nvmrc`) y pnpm (`corepack enable`).

```bash
pnpm install
pnpm --filter @tacazo/client dev   # mesa en http://localhost:5173
pnpm --filter @tacazo/game-server dev   # partidas en línea en :2567
pnpm run check                     # formato, lint, tipos, pruebas y build
```

## Scripts

| Comando | Qué hace |
| --- | --- |
| `pnpm run check` | Todo lo que corre CI: formato, lint, tipos, pruebas y build |
| `pnpm test` | Pruebas con Vitest |
| `pnpm --filter @tacazo/client dev` | Cliente en modo desarrollo |
| `pnpm --filter @tacazo/game-server dev` | Servidor de partidas en modo desarrollo |
| `DATABASE_URL=... pnpm --filter @tacazo/api migrar` | Monta o pone al día la base de datos |
| `DATABASE_URL=... pnpm --filter @tacazo/api senales` | Trabajo nocturno de señales anti-trampas |
| `node scripts/check-secrets.mjs --history` | Busca secretos en los archivos y en el historial |
| `node scripts/check-links.mjs` | Revisa los enlaces internos de la documentación |

## Arquitectura

Un paquete `core` con la física y las reglas lo usan el cliente, el servidor
de partidas y el bot. El cliente solo envía la intención del tiro (ángulo,
fuerza y efecto); el servidor la valida, la simula y devuelve el resultado.
El detalle está en
[ARQUITECTURA.md](docs/ARQUITECTURA.md) y los diagramas en
[DIAGRAMAS.md](docs/DIAGRAMAS.md).

## Seguridad y privacidad

Además de la seguridad web del plan general, Tacazo se protege contra
trampas: autoridad total del servidor, validación de cada mensaje, reloj de
turno en el servidor, repeticiones revisables y premios por anuncios
verificados del lado del servidor. Estado de cada punto en
[SEGURIDAD_OWASP.md](docs/SEGURIDAD_OWASP.md) y en [LEGAL.md](docs/LEGAL.md).

## Accesibilidad, idiomas y SEO

Se busca WCAG 2.2 AA. El juego está en **español, inglés y portugués**:
arranca en el idioma del dispositivo y se cambia con el selector 🌐 del pie
([IDIOMAS.md](docs/IDIOMAS.md)). Se puede jugar sin ratón (flechas para
apuntar, Espacio sostenido en la barra de fuerza para tirar, teclas 1 a 6 para
cantar la tronera de la 8), hay opción de **bolas con número** para quien
confunde colores y se respeta «reducir movimiento» del sistema.

## Despliegue y versiones

Dónde se publica, qué variables necesita y cómo se versiona. Paso a paso en
[DESPLIEGUE.md](docs/DESPLIEGUE.md). Cada versión es un tag `vX.Y.Z`: al
subirlo se publica el release con sus notas, y los cambios quedan en el
[CHANGELOG](CHANGELOG.md).

## Documentación

| Documento | Contenido |
| --- | --- |
| [Juego](docs/JUEGO.md) | Modos, formas de jugar y reglas |
| [Física](docs/FISICA.md) | Motor determinista y mesas como datos |
| [Multijugador](docs/MULTIJUGADOR.md) | Mensajes, reconexión, matchmaking y ranking |
| [Moderación](docs/MODERACION.md) | Señales anti-trampas, reportes, sanciones y apelaciones |
| [Economía](docs/ECONOMIA.md) | Monedas, salas por nivel, cosméticos, anuncios y tienda |
| [Marca](docs/MARCA.md) | Logo, colores, tipografía, sonido y animación |
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

- [x] Reemplazar `Tacazo` y `Tacazo` en todos los archivos (`node scripts/iniciar-proyecto.mjs` lo hace solo)
- [x] Dejar en `.github/dependabot.yml` solo los ecosistemas que use el proyecto
- [x] Ajustar los lenguajes de `.github/workflows/codeql.yml` (CodeQL y Scorecard solo corren en repos públicos; en uno privado se saltan solos)
- [x] Cambiar el paso «Pruebas» de `.github/workflows/ci.yml` por el comando propio del proyecto cuando exista (por ejemplo `npm run check`)
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
