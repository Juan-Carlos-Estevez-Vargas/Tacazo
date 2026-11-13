# Idiomas (i18n)

Guía para que la app hable varios idiomas. Por defecto: **español** (base),
**inglés** y **portugués**. Si el proyecto es React + TypeScript, la base lista
para copiar está en [`extras/i18n-react/`](../extras/i18n-react/). En otros
stacks, se aplican las mismas reglas.

## Reglas

1. **Arranca en el idioma del dispositivo.** Se lee `navigator.languages` en
   orden y se toma el primero disponible (`pt-BR` → `pt`, `en-GB` → `en`). Si
   no hay ninguno, se usa el idioma base.
2. **Se cambia con un selector visible y se recuerda.** El selector 🌐 va en la
   cabecera (dentro del menú en el celular), en el pie y en la cuenta de la
   persona. Es un `<select>` nativo y la elección se guarda en `localStorage`.
   Si existe una cuenta, también puede guardarse en el perfil.
3. **Cero textos sueltos en el código.** Todo lo que ve la persona sale del
   diccionario: botones, etiquetas, `aria-label`, `title`, `placeholder`,
   `alt`, avisos (toasts), errores, títulos de página y metadatos SEO.
4. **Diccionarios tipados.** El idioma base define el tipo y las traducciones
   se declaran con ese tipo. Así, una clave que falte o sobre no compila. Una
   prueba revisa además que las formas coincidan y que no queden textos vacíos.
5. **Variables y plurales como funciones**, nunca concatenando:
   `count: (n) => \`${n} ${n === 1 ? "foto" : "fotos"}\``.
6. **Fechas, horas y números con `Intl`** en el idioma activo, nunca con
   `"es-CO"` fijo en el código.
7. **Carga diferida.** El idioma base va en el paquete principal y los demás
   se descargan solo cuando alguien los usa.
8. **`<html lang>` cambia con el idioma** (WCAG 3.1.1), igual que `og:locale`
   e `inLanguage` del JSON-LD.
9. **Mensajes del servidor.** Si la base de datos o las funciones responden en
   un solo idioma, el cliente reconoce los mensajes conocidos y los muestra
   traducidos. Un mensaje desconocido se muestra tal cual.
10. **No se traduce lo que escribe la gente** (mensajes, notas, contenido
    editable): se muestra como fue escrito.
11. **Legales.** El texto en el idioma base es el que vale. Las traducciones
    son de cortesía y lo dicen arriba (ver [LEGAL.md](LEGAL.md)).

## En Tacazo

El cliente no usa React, así que la base es la misma idea sin hooks:

```
apps/client/src/i18n/
  idiomas.ts     IDIOMAS (es, en, pt), elegirIdioma() y su etiqueta BCP 47
  es.ts          idioma base; define el tipo Mensajes
  en.ts, pt.ts   mismas claves, tipadas con Mensajes (se descargan al usarlas)
  index.ts       msg(), cambiarIdioma(), numero() con Intl, traducirPagina(), delServidor()
  i18n.test.ts   detección, mismas claves en todos, cada data-t existe y nada en español suelto
```

- **HTML**: los textos fijos llevan `data-t="html.cancelar"` (y
  `data-t-aria`, `data-t-title`, `data-t-placeholder` para atributos).
  `traducirPagina()` los llena y cambia `<html lang>`, el título y la
  descripción.
- **Código**: `msg().juego.ganaste`, `msg().cola.buscando(s)`. Lo que se pinta
  en código y debe cambiar al instante se suscribe con `alCambiarIdioma()`.
- **Servidor**: la API y el servidor de partidas responden en español y, cuando
  pueden, con un `codigo` (`saldo`, `sesion`, `sancion`…). `delServidor()`
  traduce primero por código, luego por texto conocido (`servidor` en cada
  diccionario) y, si no lo conoce, lo muestra tal cual.
- **Nombres de salas**: se traducen por id en el cliente (`sala.nombres`).

## Estructura (React + TypeScript)

```
src/i18n/
  locales.ts        idiomas disponibles, etiqueta BCP 47 y matchLocale()
  store.ts          estado sin React: msg(), setLocale(), getLocale(), Intl en caché
  index.ts          store.ts + hooks useT() y useLocale()
  serverMessages.ts fromServer(): mensajes conocidos del servidor, traducidos
  messages/
    es/             idioma base: un archivo por área (common, errors, auth…) + index.ts
    en/             mismas claves, tipadas con Messages["área"]
    pt/
  i18n.test.ts      detección, diccionarios completos y cambio de idioma
src/app/LanguagePicker.tsx  selector 🌐 (compacto para la cabecera)
```

Uso:

```tsx
const t = useT();                    // en componentes: se vuelve a pintar al cambiar
<button>{t.common.save}</button>
<p>{t.common.items(3)}</p>

msg().errors.network                 // fuera de React (dominio, servicios)
```

Arranque: `main.tsx` espera `initI18n()` antes de pintar.

```ts
await initI18n();
createRoot(root).render(<App />);
```

El dominio y los servicios importan de `@/i18n/store` (no de `@/i18n`), así
siguen sin depender de React.

## Agregar un idioma

1. Copia `src/i18n/messages/en/` a `src/i18n/messages/<código>/` y traduce.
2. Agrega su fila en `LOCALES` (`locales.ts`) y su cargador en `store.ts`.
3. Corre las pruebas: si falta una clave, el typecheck lo dice.
4. Si hay legales, agrega su traducción con el aviso de cortesía.
5. Actualiza el README, `docs/DIAGRAMAS.md` y el manual de usuario.

## Agregar textos

- Ponlos en el área (archivo) que corresponda del idioma base y luego en
  **todos** los demás idiomas en el mismo PR.
- Nombra las claves por su significado (`saveChanges`), no por el texto.
- Un texto con variables va como función, también en las traducciones.

## Revisión

- [ ] Ningún texto visible quedó escrito a mano en un componente
- [ ] Las claves nuevas están en todos los idiomas y las pruebas pasan
- [ ] Fechas y números usan `Intl` con el idioma activo
- [ ] El selector funciona con teclado y `<html lang>` cambia
- [ ] Se probó al menos una pantalla en cada idioma (textos largos no rompen el diseño)
