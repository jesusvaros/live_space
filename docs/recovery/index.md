# Recuperación de datos heredados

## Principio

Los backups son evidencia, no una migración lista para producción. El cluster
completo contiene roles y tablas internas de Supabase; restaurarlo sobre un
proyecto nuevo sobrescribiría seguridad y estado de Auth. Solo se restaura en un
PostgreSQL descartable y aislado para extraer candidatos revisados.

## Inventario verificado

Los dos archivos auditados están fuera del repositorio. Sus SHA-256 son:

| Archivo | Tamaño | SHA-256 |
| --- | ---: | --- |
| `db_cluster-10-12-2025@00-47-29.backup.gz` | 38.518 B | `c186c82f0f381225daa6bc305e11d1678dc01b4edb8ad0b7e9bc52e6bfca0369` |
| `aescoklkdyehyfpsqntr.storage.zip` | 112.964.543 B | `320aef4f8224307350e802855ab589e659cbd80cd8cd0b64667d3caeff685593` |

El detalle PII-safe y los hashes de los ocho contenidos únicos están en
[`inventory-2026-07-17.json`](./inventory-2026-07-17.json). Se regenera con
`tools/recovery/inventory.py`, sin extraer los binarios:

```bash
python3 tools/recovery/inventory.py \
  --database /ruta/db_cluster-10-12-2025@00-47-29.backup.gz \
  --storage /ruta/aescoklkdyehyfpsqntr.storage.zip
```

## Procedimiento seguro

1. Verificar ambos hashes antes de abrir los archivos.
2. Crear una instancia PostgreSQL local, desechable y sin puerto público.
3. Restaurar allí el dump completo; guardar el log sin valores de filas.
4. Ejecutar `tools/recovery/selective_snapshot.sql`.
5. Validar los conteos esperados: 10 artistas, 8 salas, 2 perfiles, 0 vídeos y
   8 objetos registrados.
6. Revisar manualmente artistas y salas: nombre, slug, localidad, enlaces e imagen.
7. Correlacionar objetos y entradas ZIP por hash, no por nombre de fichero.
8. Extraer una única copia local por checksum con
   `tools/recovery/extract_unique_media.py`. La herramienta verifica el SHA-256
   del archivo, tamaños y extensiones, y no reutiliza rutas heredadas.
9. Registrar los ocho checksums en `recovered_media_quarantine`; no subir ni
   publicar ningún binario todavía.
10. Promover un catálogo o recurso únicamente cuando tenga propietario, entidad,
   permiso/licencia y procedencia verificables.
11. Importar mediante migración/seed versionado al proyecto nuevo, reconciliar y
    borrar de forma segura la instancia y los exports temporales.

## Qué se importa

- Diez artistas y ocho salas como candidatos `review`, conservando el UUID antiguo
  únicamente dentro de `external_ids` como procedencia. No se consideran publicados.
- Media única aprobada, subida mediante el flujo normal de Cloudinary y registrada
  con checksum, licencia, propietario y relación.
- No se reusan URLs antiguas como fuente canónica.

## Qué permanece en cuarentena

- Los dos perfiles históricos hasta reactivación voluntaria del usuario.
- Todo objeto sin propietario, concierto, artista/sala o permiso demostrable.
- Cualquier vídeo inesperado, discrepancia de conteo o hash desconocido.

## Qué nunca se importa

Usuarios de Auth, contraseñas, identidades, sesiones, refresh/one-time tokens,
datos MFA, secretos, roles internos, auditoría de Auth ni configuración del
cluster. Los usuarios históricos crean o recuperan una cuenta nueva.

## Criterio de cierre

La suma de `promovido + cuarentena + duplicado descartado` debe explicar las 13
entradas y los 8 contenidos únicos. El informe final registra conteos y hashes,
nunca PII ni rutas originales.

## Estado de ejecución

- El inventario fue reproducido y los conteos reconciliados.
- Los ocho binarios únicos se extrajeron dos veces de forma idempotente en el
  directorio local ignorado `recovery-work/quarantine`.
- Los tres vídeos cumplen el máximo de 75 MB, pero uno dura aproximadamente 48 s
  y supera el límite de 45 s del piloto; permanece bloqueado además de no tener
  propietario/licencia verificados.
- La migración `20260718000300_recovered_catalog.sql` está aplicada y registrada
  en el historial remoto. La reconciliación devuelve 10 artistas, 8 salas y 8
  registros de cuarentena; el rol anónimo no puede leer la cuarentena ni ve los
  candidatos con estado `review`.
- No se han importado perfiles, usuarios Auth, sesiones, contraseñas ni tokens.
