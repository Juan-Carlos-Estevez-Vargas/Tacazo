# Anti-trampas y moderación

Nada se sanciona de forma automática. Las señales y los reportes abren un
caso, y una persona de moderación decide después de ver las repeticiones.

## Señales

Código: `apps/api/src/senales.ts`. Se calculan volviendo a jugar las
repeticiones guardadas con el mismo motor, así que solo usan lo que el
servidor ya validó.

| Señal | Qué mide | Por qué |
| --- | --- | --- |
| `punteria` | Error mediano entre el ángulo del tiro y la línea exacta de bola fantasma, en tiros limpios metidos (sin efecto lateral ni inclinación) | Una persona tiene temblor; un programa que calcula el tiro no |
| `cortes` | Proporción de cortes de más de 60° que entran | Meter casi todos los cortes difíciles es raro incluso para los mejores |
| `tiempo` | Desviación del tiempo para pensar, descontando la animación del tiro anterior | Un programa tira siempre al mismo ritmo |

Cada señal exige un mínimo de muestras antes de opinar. El puntaje es la
cantidad de señales activas; desde 2 se abre un caso.

Los umbrales de producción van en la variable privada `TACAZO_UMBRALES`
(JSON), para que nadie los lea en el repo y juegue justo por debajo. Los de
`UMBRALES_EJEMPLO` solo sirven para las pruebas.

## Trabajo nocturno

`pnpm --filter @tacazo/api senales` corre cada noche con `DATABASE_URL` y
`TACAZO_UMBRALES`:

1. Toma las partidas clasificatorias de los últimos 7 días y suma las
   muestras de cada jugador.
2. Abre o actualiza un caso para quien pase el umbral (un solo caso abierto
   por jugador).
3. Abre caso a quien tenga reportes de trampa de 3 personas distintas en
   30 días.

Las repeticiones de otra versión del motor no se miden: la física cambió.

## Reportes

Desde el final de una partida, cada jugador puede reportar al rival una vez
por partida, con motivo `trampa`, `nombre`, `abandono` u `otro` y hasta 500
caracteres. Máximo 10 reportes por día. La base solo acepta reportes de
partidas en las que jugaron los dos, y nadie ve reportes ajenos.

## Sanciones

Cada sanción sube un escalón respecto a las vigentes del último año:

| Nivel | Sanción |
| --- | --- |
| 1 | Aviso |
| 2 | Un día sin clasificatorias |
| 3 | Siete días sin jugar |
| 4 | Cuenta cerrada |

El servidor de partidas consulta `restricciones()` antes de poner a alguien
en la cola.

## Apelación

El jugador sancionado puede apelar una vez, dentro de 14 días, con al menos
10 caracteres. Si moderación la acepta, la sanción se levanta y deja de
contar para el siguiente escalón.

## Permisos

| Rol | Puede |
| --- | --- |
| `tacazo_api` | Crear y ver sus reportes, ver y apelar sus sanciones |
| `tacazo_partidas` | Leer sanciones |
| `tacazo_moderacion` | Leer partidas y reportes, crear y resolver casos y sanciones |

Detalle del flujo en [DIAGRAMAS.md](DIAGRAMAS.md#moderación).
