# Política de seguridad

## Versiones con soporte

Sólo la versión desplegada desde la rama principal (el último
[release](https://github.com/Juan-Carlos-Estevez-Vargas/NOMBRE-DEL-REPO/releases))
recibe correcciones de seguridad.

| Versión | Soporte |
| --- | --- |
| Último release | ✅ |
| Releases anteriores | ❌ |

## Cómo reportar una vulnerabilidad

**No abras un issue público** con los detalles de una vulnerabilidad.

1. Ve a la pestaña
   [**Security → Report a vulnerability**](https://github.com/Juan-Carlos-Estevez-Vargas/NOMBRE-DEL-REPO/security/advisories/new)
   del repositorio y envía un reporte privado.
2. Incluye, si puedes:
   - qué parte se ve afectada (página, función del servidor, permisos,
     cabeceras, etc.);
   - los pasos para reproducirlo o una prueba de concepto;
   - el impacto que crees que tiene.

Si el reporte privado no está disponible, abre un issue pidiendo un canal de
contacto **sin incluir ningún detalle técnico**.

## Qué puedes esperar

- Confirmación de recibido en un máximo de **5 días**.
- Una evaluación inicial y un plan en un máximo de **14 días**.
- Aviso cuando la corrección esté publicada y crédito en las notas del release
  si así lo deseas.

## Alcance

Dentro del alcance: el código de este repositorio (aplicación, migraciones, flujos de GitHub Actions y
configuración de producción).

Fuera del alcance: ataques de denegación de servicio, ingeniería social,
vulnerabilidades de los proveedores (hosting, base de datos, GitHub) en sí mismos, y reportes
automáticos sin una prueba de impacto real.

Por favor, no accedas a datos de otras personas ni los modifiques mientras
investigas. Prueba en tu propia instalación ([inicio rápido](README.md#inicio-rápido)).

El modelo de amenazas y cómo se cubre cada riesgo del OWASP Top 10 está en
[docs/SEGURIDAD_OWASP.md](docs/SEGURIDAD_OWASP.md).
