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

## Lo que se activa a mano

- GitHub → Settings → Code security: Secret scanning, Push protection, Dependabot alerts, Private vulnerability reporting.
- GitHub → Settings → Rules: rama principal protegida (PR obligatorio, CI en verde, sin force push).
- 2FA en GitHub y en cada proveedor.
