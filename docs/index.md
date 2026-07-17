# Wiki de Live Space

Live Space es una plataforma audiovisual y responsive para descubrir conciertos,
seguir artistas y salas, y conservar momentos creados por fans. Web, Android e
iOS comparten el producto; las herramientas profesionales y de moderación están
disponibles en todos los formatos, adaptadas al tamaño de pantalla.

## Principios

- **Un producto:** mismas rutas, permisos y capacidades en web y apps.
- **Procedencia primero:** ningún evento o recurso de catálogo se publica sin
  fuente, momento de captura y trazabilidad.
- **Privacidad y seguridad por defecto:** RLS, mínimo privilegio, secretos fuera
  del cliente y revisión humana para acciones irreversibles.
- **Audiovisual sostenible:** límites explícitos de subida y una abstracción de
  proveedor para no acoplar el dominio a Cloudinary.
- **Operación reproducible:** esquema, workers, documentación y recuperación
  versionados junto al código.
- **Piloto sin coste recurrente:** Madrid y Barcelona, con alertas y frenos antes
  de consumir las cuotas gratuitas.

## Cómo usar esta wiki

| Necesidad | Documento |
| --- | --- |
| Entender qué existe y qué falta | [Estado actual](./estado-actual.md) |
| Revisar recorridos, pantallas y paridad | [Producto y pantallas](./producto.md) |
| Comprender componentes y flujo de datos | [Arquitectura](./arquitectura.md) |
| Consultar entidades y relaciones | [Modelo de datos](./modelo-datos.md) |
| Verificar o recuperar los backups heredados | [Recuperación](./recovery/index.md) |
| Operar Supabase, Cloudinary, backups o incidentes | [Runbooks](./runbooks.md) |
| Mantener el pipeline de agendas | [Scraping](./scraping.md) |
| Operar media, licencias y moderación | [Media](./media.md) y [Moderación](./moderacion.md) |
| Coordinar trabajo asistido | [Manual de agentes](./agentes.md) |
| Ver fases y puertas de salida | [Roadmap](./roadmap.md) |

## Regla de mantenimiento

Todo cambio de comportamiento, interfaz pública, esquema, RLS, fuente de datos o
procedimiento operativo debe actualizar la página correspondiente en el mismo
PR. Las decisiones que cambien arquitectura, coste, privacidad o proveedores se
registran además como ADR antes de implementarse.
