# Legal y privacidad

Tacazo tendrá cuentas, datos personales y anuncios, así que aplica completo.
No hay cobros hasta la fase 10.

| Punto | Estado | Dónde |
| --- | --- | --- |
| Política de privacidad (Ley 1581 de 2012) | 🟡 | [privacidad.html](../apps/client/public/legal/privacidad.html); faltan el correo y la ciudad del responsable, y la revisión de un abogado |
| Términos y condiciones | 🟡 | [terminos.html](../apps/client/public/legal/terminos.html), con conducta, sanciones y apelación; mismo pendiente |
| Consentimiento con prueba (casilla desmarcada, fecha y versión guardadas) | ✅ | Tabla `consentimientos`, inmutable: documento, versión, fecha, rango de edad y autorización del acudiente |
| Derechos de consulta y supresión (habeas data) | ✅ | «Mis datos» en el juego: `GET /yo/datos` baja todo en JSON y `DELETE /yo` borra el jugador |
| Cookies y banner | ✅ | Solo almacenamiento necesario; las cookies de Google, solo con anuncios personalizados aceptados ([ECONOMIA.md](ECONOMIA.md#cómo-está-hecho)) |
| Cobros claros y reembolsos | ➖ | |
| Texto alternativo en imágenes | ❌ | |
| Licencias de imágenes, fuentes y dependencias | 🟡 | Logo y sonidos propios; fuentes SIL Open Font ([MARCA.md](MARCA.md)); falta la prueba de dependencias |
| Marca registrada ante la SIC | ❌ | Clases 9 y 41 (#5) |
| Consentimiento de anuncios y edad mínima | 🟡 | Edad mínima 14; de 14 a 17 con autorización del acudiente. Aviso propio antes de cargar anuncios y no personalizados a menores ([ECONOMIA.md](ECONOMIA.md#cómo-está-hecho)); falta la CMP certificada por Google para el EEE y Reino Unido |

## Cómo está hecho

- Las versiones vigentes están en `LEGAL` de `packages/core/src/legal.ts`. Al
  cambiar un texto se sube su fecha: la API rechaza versiones viejas y el
  cliente pide aceptar de nuevo antes de la siguiente clasificatoria.
- No se crea jugador sin aceptación: el jugador y sus dos filas de
  `consentimientos` entran en la misma transacción.
- Solo se pide el rango de edad, no la fecha de nacimiento. Por debajo de 14
  el diálogo no deja seguir; se puede jugar contra el bot o con amigos por
  enlace, que no guardan datos.
- Borrar un jugador quita nombre, país, cuenta, rating, amigos y cosméticos, y
  corta sus sesiones. Quedan con el id como seudónimo el libro de monedas, las
  partidas del rival, los reportes, las sanciones y los consentimientos.
- Consultas en máximo 10 días hábiles y reclamos en 15 (artículos 14 y 15 de
  la Ley 1581).

## Servicios externos que reciben datos

| Servicio | Qué recibe | Para qué |
| --- | --- | --- |
| Google AdSense (web) y AdMob (apps) | Cookies o identificador de publicidad solo con anuncios personalizados aceptados; datos del dispositivo; en AdMob, el id del jugador para el premio | Mostrar anuncios y verificar el anuncio con premio |
| Neon (base de datos y Neon Auth) | Todo lo que guarda el juego; correo y nombre de la cuenta | Guardar el juego e iniciar sesión |
| Cloudflare Turnstile | IP y datos del navegador | Comprobar que quien crea un jugador es una persona |

## Traducciones

Si la app está en varios idiomas, el texto legal válido es el del idioma base.
Las versiones traducidas son de cortesía y lo dicen al inicio.
