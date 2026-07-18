# Arquitectura

## Vista general

```text
React 19 + Vite + React Router 7
  ├─ web responsive
  └─ Capacitor 8 (Android/iOS)
        │
        ├─ Supabase Auth + PostgreSQL + RLS
        ├─ Edge Functions (operaciones privilegiadas)
        ├─ Cloudinary (media y transformaciones)
        └─ workers deterministas (ingesta y calidad)
```

## Cliente compartido

El árbol de rutas, los servicios, el modelo de permisos y más del 95 % de los
componentes se comparten. El `AppShell` presenta navegación inferior en móvil y
barra lateral o cabecera en escritorio. Las diferencias permitidas son de
capacidad: cámara, push, QR y deep links nativos; drag-and-drop y gestión masiva
en escritorio. Ninguna función social o profesional esencial es exclusiva de una
plataforma.

La UI utiliza HTML estándar, Tailwind, primitivas Radix y componentes propios.
Mapa, reproductor, QR y administración se cargan de forma diferida. Las páginas
no consultan Supabase directamente: usan servicios tipados para que permisos,
errores, caché e instrumentación sean consistentes.

## Dominios del backend

| Dominio | Responsabilidad |
| --- | --- |
| Identidad | perfiles, privacidad, bloqueos y preferencias |
| Catálogo | artistas, salas, alias e identificadores externos |
| Agenda | eventos, artistas, precios, entradas y cancelaciones |
| Social | follows, guardados, asistencia, posts y likes |
| Profesionales | membresías y roles por artista o sala |
| Media | activos, propiedad, licencia, metadatos y moderación |
| Setlists | canciones e interpretaciones por evento |
| Ingesta | fuentes, ejecuciones, staging, confianza y procedencia |
| Moderación | reportes, acciones, apelaciones y auditoría |

Las migraciones son la única fuente de verdad y generan los tipos TypeScript. Las
relaciones polimórficas se encapsulan en servicios; el cliente no construye
consultas privilegiadas. La `service_role` solo existe en Edge Functions y
workers privados.

## Flujo de media

1. El cliente autenticado solicita una firma de corta duración.
2. Una Edge Function valida rol, contexto, MIME, tamaño y cuota.
3. El cliente sube directamente a Cloudinary.
4. Cloudinary genera variantes y envía un webhook firmado.
5. El backend valida idempotencia y registra metadatos en Supabase.
6. Moderación decide si queda pendiente o publicado.

Los carteles y momentos ya siguen este flujo. El cliente espera la confirmación
del webhook antes de crear el post canónico, de forma que nunca guarda una URL de
Cloudinary como sustituto de un activo verificado. Las URLs externas de carteles
se han retirado del formulario para mantener procedencia y licencia controladas.

## Modelos de lectura

Las vistas `v_subject_artists`, `v_subject_venues` y `v_event_cards` componen los
campos visuales derivados sin duplicarlos en las tablas de catálogo. La vista
`v_event_posts_with_setlist` mantiene temporalmente el contrato de timeline de la
interfaz heredada. Todas usan `security_invoker`, por lo que las políticas RLS de
las tablas subyacentes siguen aplicándose al visitante.

El dominio depende de `MediaProvider`, no de la API concreta. La política inicial
admite vídeo de hasta 45 s/75 MB con variante pública 720p, imágenes de hasta
10 MB/2048 px y diez vídeos por usuario al mes. El borrado físico ocurre siete
días después del borrado lógico.

## Entornos

- **Local:** Supabase CLI, credenciales de desarrollo y Cloudinary de pruebas.
- **Pilot:** un proyecto Supabase Free europeo y un entorno Cloudinary dedicado.
- **Producción futura:** se crea solo al superar la beta; nunca comparte secretos
  ni datos con local.

Los despliegues pueden automatizarse tras CI. RLS, migraciones destructivas,
secretos, costes y publicación en tiendas siempre requieren aprobación humana.
