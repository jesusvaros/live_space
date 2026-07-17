# Seguridad y permisos

## Matriz de acceso

| Actor | Lectura | Escritura |
| --- | --- | --- |
| Anónimo | catálogo, eventos y media publicados | ninguna |
| Usuario | lo público y sus datos privados | su perfil, relaciones y contenido |
| Profesional | lo público y entidades asignadas | según rol `owner/admin/editor/moderator` |
| Moderador | colas y evidencia necesarias | decisiones reversibles y auditadas |
| Administrador | administración global justificada | acciones globales auditadas |
| Worker | solo recursos de su tarea | mediante credencial privada mínima |

## Reglas obligatorias

- RLS habilitada en todas las tablas expuestas y política explícita por operación.
- Denegar por defecto: ausencia de política equivale a ausencia de acceso.
- `service_role`, secretos Cloudinary y contraseñas nunca llegan al bundle ni a
  logs, issues, chat o documentación.
- Firmas de subida con expiración corta, carpeta limitada y parámetros validados.
- Webhooks validados criptográficamente, idempotentes y resistentes a repetición.
- Cambios de rol, moderación y fusiones de entidades generan auditoría inmutable.
- Los logs eliminan tokens, email, IP completa y rutas de Storage con UUID.

## Contenido generado por usuarios

Antes de la beta deben existir aceptación de términos, reporte de contenido y
usuario, bloqueo, ocultación provisional, revisión, apelación y SLA interno. El
usuario confirma derechos de subida. Un recurso de catálogo necesita procedencia,
autor, licencia y atribución; si faltan se usa placeholder.

## Backups y datos heredados

Los archivos originales se tratan como datos sensibles: acceso mínimo, copia
verificada por SHA-256 y almacenamiento cifrado. El dump se restaura solo en una
instancia aislada. `auth.*`, sesiones, refresh tokens, contraseñas y MFA nunca se
migran. Los perfiles y objetos antiguos permanecen en cuarentena hasta revisión.

## Pruebas mínimas

- RLS como anónimo, usuario ajeno, propietario, profesional de cada rol,
  moderador, administrador y worker.
- Firma caducada, modificada, reutilizada, MIME falso y exceso de cuota.
- Webhook inválido, duplicado y fuera de orden.
- Intentos de elevar rol, editar otra entidad o consultar cuarentena.
- Escaneo de secretos en cada PR y revisión de dependencias antes de release.
