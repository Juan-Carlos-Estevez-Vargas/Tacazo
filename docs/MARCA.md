# Marca

**Tacazo.** El ícono es la bola blanca con un punto azul: la tiza del taco en
el punto exacto donde se le pega para darle efecto.

## Archivos

| Archivo | Uso |
| --- | --- |
| `apps/client/public/marca/tacazo-icono.svg` | Ícono de app sobre paño |
| `apps/client/public/marca/tacazo-icono-mono.svg` | Versión de una tinta |
| `apps/client/public/favicon.svg` | Favicon |
| `apps/client/src/marca.ts` | Colores, fuentes y bolas para el código |

## Colores

| Nombre | Claro | Oscuro | Uso |
| --- | --- | --- | --- |
| Paño | `#0E5A45` | `#1D8A68` | Mesa y marca |
| Tiza | `#2C6BD8` | `#6C9CF0` | Acción, foco, tu turno |
| Latón | `#C08A2B` | `#E0A845` | Monedas y premios |
| Marfil | `#F7F5EE` | | Bola blanca, fondos claros |
| Noche | `#0B1512` | | Fondo oscuro del juego |

## Tipografía

Anybody (títulos y marcador), Atkinson Hyperlegible (textos) y JetBrains Mono
(números). Las tres tienen licencia SIL Open Font.

## Reglas del logo

- El punto azul queda abajo a la izquierda de la bola y no cambia de color.
- Tamaño mínimo: 24 px el ícono, 96 px de ancho la palabra.
- Sin bolas numeradas, el 8 negro ni coronas en el logo.

## Sonido y animación

Los efectos se sintetizan con Web Audio a partir de la física (taco, choque,
banda, tronera, tiza, turno, monedas, victoria), sin archivos de terceros.
Con "reducir movimiento" se quitan el polvo de tiza, el titileo y las
transiciones de menú.
