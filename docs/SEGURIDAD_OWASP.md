# Seguridad

Estado de cada punto del plan general. Leyenda: ✅ cumplido · 🟡 parcial · ❌ pendiente · ➖ no aplica.

| Punto | Estado | Cómo se cumple | Prueba |
| --- | --- | --- | --- |
| Ocultar API keys | ❌ | | |
| Eliminar secretos de git | 🟡 | `scripts/check-secrets.mjs --history` en CI | CI |
| Row level security / autorización por fila | ❌ | | |
| Encriptar datos sensibles | ❌ | | |
| Bloquear manipulación de campos | ❌ | | |
| Proteger sesión y cookies | ❌ | | |
| Hashear contraseñas | ❌ | | |
| Rate limiting | ❌ | | |
| Protección contra bots | ❌ | | |
| Parametrizar queries | ❌ | | |
| Validar inputs | ❌ | | |
| Sanitizar contenido | ❌ | | |
| Restringir archivos | ❌ | | |
| Forzar HTTPS | ❌ | | |
| Escanear dependencias | 🟡 | Dependabot + auditoría en CI | CI |
| Análisis de código | ✅ | CodeQL en cada PR y cada semana | `codeql.yml` |
| Puntaje de prácticas del repo | ✅ | OpenSSF Scorecard | `scorecard.yml` |
| Mínimo privilegio en CI | ✅ | `permissions: contents: read` por defecto; escritura solo en el job que la necesita | `.github/workflows/` |
| Acciones fijadas por SHA | ✅ | `uses: accion@<sha> # vX`, al día con Dependabot | `.github/workflows/` |
| Revisión obligatoria | 🟡 | CODEOWNERS pide revisión; falta la regla de rama protegida | `.github/CODEOWNERS` |

## Seguridad del juego

Las reglas de detección de trampas y sus umbrales viven en configuración
privada del servidor, nunca en este repo.

| Amenaza | Estado | Defensa | Issue |
| --- | --- | --- | --- |
| Cliente modificado que inventa resultados | ❌ | El servidor simula cada tiro; el cliente no reporta posiciones | #18 |
| Tiros fuera de rango o fuera de turno | ❌ | Esquema por mensaje con rangos y turno | #19 |
| Reenvío o alteración de paquetes | ❌ | WSS, token de partida firmado, número de secuencia | #19 |
| Hacks del reloj | ❌ | Reloj de turno solo en el servidor | #20 |
| Desconectarse para no perder | ❌ | Abandono = derrota tras 60 s | #20 |
| Clientes viejos o modificados | ❌ | Versión del cliente y del motor en el saludo | #23 |
| Motor no determinista | 🟡 | Lint que prohíbe `Math.random`, reloj y APIs del navegador en `core`; faltan los tiros dorados | #13 |
| Bots que apuntan solos y guía extendida | ❌ | Señales de comportamiento y revisión de repeticiones | #27 |
| Arreglo de partidas y multicuentas | ❌ | Grafo de rivales, Turnstile, límites por dispositivo | #24, #27 |
| Spam en el WebSocket | ❌ | Límite de tasa por conexión y por cuenta | #19 |
| Premios por anuncios falsos | ❌ | Verificación del lado del servidor de la red de anuncios | #33 |
| Monedas duplicadas | ❌ | Libro de doble entrada con idempotencia | #30 |

## Lo que se activa a mano

- GitHub → Settings → Code security: Secret scanning, Push protection, Dependabot alerts, Private vulnerability reporting.
- GitHub → Settings → Rules: rama principal protegida (PR obligatorio, CI en verde, sin force push).
- 2FA en GitHub y en cada proveedor.
