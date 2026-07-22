# Runbooks

## Alta de Supabase

**Estado del piloto:** proyecto creado en París sobre Free, migraciones aplicadas,
24/24 tablas públicas con RLS y dos Edge Functions desplegadas. El token temporal
usado para el despliegue se revocó y su archivo temporal se eliminó.

1. Crear `live-space-pilot` en una región europea bajo la cuenta propietaria.
2. Guardar la contraseña en el gestor del propietario; no compartirla en chat.
3. Enlazar Supabase CLI y aplicar migraciones desde cero en un entorno vacío.
4. Activar confirmación de email y configurar localhost, dominio público y deep
   links permitidos.
5. Crear el administrador mediante flujo controlado, no importando `auth.users`.
6. Generar tipos TypeScript y ejecutar tests RLS por rol.
7. Guardar `anon` solo donde corresponda y `service_role` únicamente en secretos
   de funciones/workers.

**Verificación:** reset reproducible, cero tablas públicas sin RLS, pruebas verdes
y ausencia de claves privilegiadas en el bundle.

La contraseña generada durante el alta debe rotarse desde el panel y guardarse en
el gestor del propietario. No se considera cerrada la entrega de credenciales
hasta completar esta acción. Las URLs de redirección pública se añaden cuando el
dominio sea definitivo; no se debe usar un comodín de producción.

## Alta de Cloudinary

**Estado del piloto:** el plan Free solo permitió un entorno, por lo que se
reutilizó y renombró el entorno vacío existente como `Live Space Pilot`. Los tres
presets firmados están creados y el webhook `Upload` apunta a la función remota.

1. Usar un entorno dedicado al piloto y credenciales limitadas.
2. Reservar prefijo `live-space/pilot/` con carpetas `users`, `events`, `artists`,
   `venues`, `recovered` y `quarantine`.
3. Crear presets firmados `live_space_user_media`,
   `live_space_professional_media` y `live_space_catalog_media`.
4. Configurar webhook HTTPS y guardar secreto solo en Supabase.
5. Validar transformaciones 720p/thumbnail, MIME, tamaño, firma e idempotencia.
6. Alertar al 60 % y 70 %; pausar nuevas subidas al 80 % de créditos.

**Verificación:** una firma manipulada o caducada falla; un webhook duplicado no
crea otro activo; ningún preset permite subida anónima sin firma.

Cloudinary solo ofreció los roles `Master Admin` o `Media Library User` para la
clave dedicada. Se usó `Master Admin` porque la firma y administración del piloto
requieren acceso API; esta limitación se revisará si el proveedor incorpora un rol
de servicio más granular. La clave no debe reutilizarse fuera del piloto.

## Backup semanal

El workflow `backup-weekly.yml` queda inactivo de facto mientras no existan los
secretos `SUPABASE_DB_URL` y `BACKUP_AGE_RECIPIENT`; nunca almacena la identidad
privada de age en GitHub. Al configurarlo se ejecuta los domingos y conserva solo
el dump cifrado y el manifiesto durante 14 días.

1. Exportar esquema y datos de aplicación, excluyendo secretos y binarios.
2. Cifrar el dump antes de sacarlo del runner.
3. Crear manifiesto SHA-256, conteos y versión de migración.
4. Guardar con retención definida y acceso mínimo.
5. Restaurar mensualmente en un entorno descartable y ejecutar reconciliación.

Un backup no está validado hasta haber demostrado una restauración. Fallo de
export, cifrado, subida o prueba genera alerta y no elimina la última copia buena.

## Fuente de scraping rota

1. Suspender autopublicación de la fuente, no las demás.
2. Conservar captura y error sanitizado; no reintentar agresivamente.
3. Comparar con el fixture y comprobar términos/robots.
4. Actualizar parser y fixture en PR con prueba de regresión.
5. Reprocesar staging, revisar diferencias y reactivar tras dos ejecuciones verdes.

## Incorporar una sala descubierta

1. Ejecutar `npm run scrape:auto-probe`; el sondeo prueba agenda, parser y dos
   lecturas deterministas sin activar la fuente.
2. Revisar la muestra guardada en `metadata.autoProbe`, la agenda pública,
   condiciones aplicables y `robots.txt`.
3. Activar solo las fuentes aprobadas con
   `APPROVED_SOURCE_NAMES="Sala A,Sala B" SOURCE_REVIEW_NOTE="..." npm run
   scrape:approve-probed`.
4. Ejecutar `npm run scrape:weekly` y comprobar conteos por fuente en staging.
5. Mantener en revisión los títulos que mezclen artista, festival, género o texto
   promocional; añadir un parser específico antes de automatizar su publicación.

El comando de aprobación falla antes de mutar datos si una fuente no tiene dos
lecturas coherentes o no está marcada como lista para revisión.

## Incidente de media o cuota

1. Pausar firmas nuevas; la lectura pública sigue disponible si es segura.
2. Registrar hora, alcance, proveedor y porcentaje de cuota.
3. Revocar credencial afectada si hay sospecha de filtración.
4. Verificar Cloudinary contra registros Supabase por `public_id` y checksum.
5. Recuperar huérfanos o marcar faltantes; nunca borrar automáticamente durante
   investigación.
6. Documentar causa y acción preventiva antes de reanudar.

## Incidente de seguridad o moderación

1. Preservar evidencia mínima y restringir acceso.
2. Ocultar contenido de forma reversible cuando exista riesgo inmediato.
3. Revocar sesiones/secretos afectados y revisar auditoría.
4. Notificar al responsable humano; valorar obligaciones legales y a proveedores.
5. Corregir, probar RLS/permisos y restaurar servicio gradualmente.
6. Publicar postmortem interno sin PII.

## Rollback

El frontend vuelve al artefacto anterior. Las migraciones de datos no se revierten
ciegamente: se aplica una migración compensatoria revisada. Los cambios de RLS se
prueban antes y después. Borrado físico, fusiones y moderación irreversible exigen
aprobación humana y backup verificado.
