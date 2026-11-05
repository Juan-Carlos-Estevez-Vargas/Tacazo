# Economía

Tacazo es **gratis**. Todo se gana jugando; las monedas son virtuales y nunca se
cambian por dinero. El juego se sostiene con anuncios muy discretos. La tienda
con dinero real queda para la fase 10.

## Reglas

| Punto | Cómo |
| --- | --- |
| Libro contable | Cada movimiento es una fila de doble entrada; el saldo se calcula, no se edita |
| Solo el servidor mueve monedas | El cliente pide acciones ("entrar a sala 3"), nunca envía montos |
| Idempotencia | Cada cobro y premio con una clave única |
| Salas por nivel | Entrada fija; premio menor que el doble para frenar la inflación |
| Nadie se queda sin jugar | Premio diario; práctica y partidas con amigos no cuestan |
| Sin transferencias | No se regalan monedas entre cuentas |
| Sin cajas sorpresa | No se usan |

## Anuncios

| Punto | Cómo |
| --- | --- |
| Dónde | Solo en menús: una tarjeta pequeña en la sala de espera o en resultados, sin sonido y cerrable |
| Dónde no | Nunca en la mesa, entre tiros ni a pantalla completa sin pedirlo |
| Anuncio con premio | Si el saldo no alcanza para la sala más barata, la persona puede elegir ver un anuncio y recibir monedas, con límite diario |
| Premio verificado | Las monedas se acreditan solo cuando la red de anuncios confirma al servidor que se vio completo |
| Privacidad | Consentimiento antes de cargar anuncios; permiso de rastreo en iOS; a menores solo anuncios no personalizados |
| Redes | AdMob en las apps; API de anuncios para juegos de Google en la web |

## Tienda (fase 10, más adelante)

Tacos, monedas, pase de temporada, cosméticos y quitar anuncios. Recibos
validados en el servidor, precio total visible antes de pagar y nada que dé
ventaja en la mesa.
