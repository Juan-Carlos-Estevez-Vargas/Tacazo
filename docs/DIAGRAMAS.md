# Diagramas

Diagramas en [Mermaid](https://mermaid.js.org/); GitHub los dibuja solo. Cada
cambio en la app actualiza aquí el diagrama afectado o agrega uno nuevo.

- [Arquitectura general](#arquitectura-general)
- [Ciclo de un tiro](#ciclo-de-un-tiro)
- [Estados de la sala](#estados-de-la-sala)
- [Modelo de datos](#modelo-de-datos)
- [Inicio de sesión y permisos](#inicio-de-sesión-y-permisos)
- [Integración y despliegue](#integración-y-despliegue)
- [Versiones y releases](#versiones-y-releases)
- [Idiomas](#idiomas)
- [Inicio desde la plantilla](#inicio-desde-la-plantilla)

## Arquitectura general

```mermaid
flowchart LR
  U["Jugador"] --> C["apps/client<br/>Vite + PixiJS"]
  C -- "intención del tiro (WSS)" --> GS["apps/game-server<br/>salas autoritativas"]
  C -- "HTTPS" --> API["apps/api<br/>cuentas · ranking · monedas"]
  GS --> CORE["packages/core<br/>física y reglas"]
  C --> CORE
  BOT["apps/bot"] --> CORE
  API --> DB[("PostgreSQL")]
  GS --> R[("Redis")]
  API --> R
```

El cliente usa `core` solo para animar; el servidor de partidas lo usa para
decidir el resultado.

## Ciclo de un tiro

```mermaid
sequenceDiagram
  actor A as Jugador en turno
  participant CA as Cliente A
  participant S as Servidor de partidas
  participant CB as Cliente B
  A->>CA: apunta y suelta
  CA->>S: tirar(ángulo, fuerza, efecto, secuencia)
  S->>S: valida turno, rangos, secuencia y reloj
  alt inválido
    S-->>CA: rechazo (queda como señal de la cuenta)
  else válido
    S->>S: simula con packages/core y aplica reglas
    S->>S: guarda la entrada en la repetición
    S-->>CA: resultado + hash
    S-->>CB: resultado + hash
    CA->>CA: anima; si el hash no coincide, toma la posición del servidor
    CB->>CB: anima; si el hash no coincide, toma la posición del servidor
  end
```

## Estados de la sala

```mermaid
stateDiagram-v2
  [*] --> Esperando: se crea la sala
  Esperando --> Saque: llegan los 2 jugadores
  Saque --> Turno
  Turno --> Simulando: tiro válido
  Turno --> Turno: se acaba el reloj (falta, bola en mano)
  Simulando --> Turno: sigue la partida
  Simulando --> Terminada: alguien gana
  Turno --> EsperaReconexion: jugador desconectado
  EsperaReconexion --> Turno: vuelve antes de 60 s
  EsperaReconexion --> Terminada: abandono
  Terminada --> [*]
```

## Modelo de datos

```mermaid
erDiagram
  JUGADORES ||--o{ RATINGS : "uno por modo"
  JUGADORES ||--o{ PARTIDAS : juega
  JUGADORES ||--o{ AMISTADES : tiene
  JUGADORES {
    uuid id
    text nombre
    char pais
    text region
    boolean invitado
    text cuenta "privada"
  }
  RATINGS {
    uuid jugador
    text modo
    float r
    float rd
    float sigma
    int visible "r - 2 rd"
    int partidas
  }
  PARTIDAS {
    uuid id
    text modo
    uuid jugador_a
    uuid jugador_b
    uuid ganador
    boolean clasificatoria
    jsonb repeticion
  }
  AMISTADES {
    uuid a "a < b"
    uuid b
  }
```

Migraciones en `apps/api/migraciones/`. Seguridad por fila: con el rol
`tacazo_api` cada jugador ve solo sus partidas y amistades, y edita solo su
perfil; `tacazo_partidas` (el servidor de partidas) guarda partidas y ratings.
Detalle en [ADR 0004](adr/0004-postgres-migraciones-rls.md).

## Inicio de sesión y permisos

```mermaid
sequenceDiagram
  actor U as Usuario
  participant FE as Frontend
  participant API as Backend
  U->>FE: correo y contraseña
  FE->>API: iniciar sesión
  API-->>FE: sesión (cookie HttpOnly / token)
  FE->>API: petición con la sesión
  API->>API: valida permisos
  API-->>FE: datos permitidos
```

## Integración y despliegue

```mermaid
flowchart LR
  B["Rama"] --> PR["Pull request"]
  PR --> CI["CI: secretos · enlaces · pruebas de scripts<br/>pruebas · auditoría · build"]
  PR --> CQ["CodeQL"]
  CI -- "verde" --> M["Squash merge"]
  CQ -- "sin alertas" --> M
  M --> D["Despliegue"]
  M --> SC["Scorecard"]
  D --> T["Tag vX.Y.Z"]
  T --> R["Release con notas<br/>(release.yml)"]
  DB["Dependabot"] -. "PR de dependencias" .-> PR
```

## Versiones y releases

```mermaid
flowchart LR
  C["Commits en Conventional Commits"] --> Q{"¿Qué tipo?"}
  Q -- "feat! / BREAKING CHANGE" --> MA["Sube la mayor<br/>2.0.0"]
  Q -- "feat" --> MI["Sube la menor<br/>1.3.0"]
  Q -- "fix, docs, chore…" --> PA["Sube el parche<br/>1.2.1"]
  MA & MI & PA --> TAG["git tag vX.Y.Z<br/>git push origin vX.Y.Z"]
  TAG --> WF["release.yml"]
  WF --> REL["Release con notas agrupadas<br/>(.github/release.yml)"]
  REL --> CL["Línea en CHANGELOG.md"]
```

## Idiomas

```mermaid
flowchart TD
  A["Abrir la app"] --> B{"¿Hay idioma guardado?"}
  B -- "sí" --> L["Ese idioma"]
  B -- "no" --> C["navigator.languages<br/>matchLocale()"]
  C -- "disponible" --> L
  C -- "ninguno" --> BASE["Idioma base"]
  L --> D["Descarga su diccionario<br/>(si no es el base)"]
  D --> R["Pinta la app"]
  BASE --> R
  R --> H["&lt;html lang&gt;, SEO y fechas con Intl"]
  S["Selector 🌐"] -- "setLocale()" --> G["Guarda la elección"] --> D
```

## Inicio desde la plantilla

```mermaid
sequenceDiagram
  actor P as Persona
  participant GH as GitHub
  participant S as iniciar-proyecto.mjs
  participant CI as CI
  P->>GH: Usar esta plantilla
  GH-->>P: repo nuevo con la base
  P->>S: node scripts/iniciar-proyecto.mjs --nombre "…"
  S->>S: pone el nombre del repo en todos los archivos
  S->>S: mueve .plantilla/README.md a README.md
  S->>S: CHANGELOG limpio y se borra a sí mismo
  P->>GH: primer commit y push
  GH->>CI: secretos · enlaces · pruebas
  CI-->>P: verde
  P->>GH: ajustes manuales (lista Primeros pasos)
```
