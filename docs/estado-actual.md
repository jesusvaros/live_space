# Estado actual

Fecha de la última actualización: **18 de julio de 2026**.

## Código

- Aplicación React 19 construida con Vite y empaquetada para Android/iOS mediante
  Capacitor 8.
- React Router 7 es el router objetivo compartido; Ionic React se retira por
  completo, manteniendo solo Capacitor para capacidades nativas.
- La migración de router y primitivas está implementada: no quedan imports de
  Ionic y las pantallas pesadas se cargan en chunks separados.
- La interfaz incluye descubrimiento, agenda, mapa, feed, perfiles de artista y
  sala, detalle de evento, subida, QR y pantallas administrativas.
- El proyecto remoto Supabase `live-space-pilot` está creado en París
  (`eu-west-3`) sobre el plan Free. Las seis migraciones canónicas aplicadas
  mantienen 25 tablas públicas y RLS en todas ellas.
- La base local cuenta con configuración, seis migraciones canónicas, RLS,
  cuotas de media, modelos de lectura y Edge Functions de firma/webhook. Las
  seis migraciones están aplicadas y registradas en el piloto remoto. Falta ejecutar el reset real porque
  Docker no está disponible en esta máquina durante la revisión.
- Las funciones `cloudinary-sign-upload` y `cloudinary-webhook` están desplegadas.
  La firma exige JWT; el webhook no exige JWT de Supabase, pero valida la firma y
  fecha de Cloudinary antes de aceptar el evento.
- Cloudinary reutiliza el único entorno permitido por el plan Free, renombrado
  `Live Space Pilot`. Tiene tres presets firmados, una clave dedicada y un webhook
  limitado a eventos `Upload`. Los secretos viven únicamente en Supabase y en el
  entorno local ignorado por Git.
- El nuevo contrato normaliza autores, membresías y activos respecto al SQL
  heredado. Auth, catálogo, agenda, gestión profesional, setlists, mapa y detalle
  de evento, Feed, Perfil, Upload y administración ya usan el contrato canónico o
  sus modelos de lectura. No quedan accesos al bucket `media` ni nombres de claves
  foráneas heredadas en el cliente.
- La ingesta dispone de fuentes, ejecuciones, staging, normalización y
  deduplicación. Hay 18 fuentes piloto registradas y cuatro operativas: Siroco,
  Sala Apolo, Sala El Sol y Razzmatazz. Los parsers oficiales han publicado ya
  12 conciertos, 3 salas y 13 artistas; las otras 14 fuentes siguen pendientes de
  parser específico.

## Deuda heredada

- Conviven SQL históricos incompatibles; no deben ejecutarse en bloque sobre el
  proyecto nuevo.
- Los backups incluyen datos de Auth que no se restaurarán: cuentas, sesiones,
  tokens y contraseñas quedan expresamente fuera de la migración.
- TypeScript, lint, 21 pruebas unitarias, 6 smoke tests E2E responsive, build de
  aplicación y build de documentación pasan y están conectados a CI. Aún faltan
  la matriz de tests RLS, fixtures por fuente y pruebas completas de subida.
- El audit de producción está limpio. VitePress 1.6.4 arrastra tres avisos solo de
  desarrollo sin actualización estable disponible; la wiki no debe exponerse
  mediante su servidor de desarrollo en una red no confiable.
- El catálogo inicial es muy pequeño y no contiene vídeos registrados en la tabla
  pública heredada, aunque el archivo de Storage sí conserva media en cuarentena.

## Evidencia recuperada

| Fuente | Evidencia segura |
| --- | --- |
| Dump PostgreSQL | 10 artistas, 8 salas, 2 perfiles y 0 vídeos públicos |
| Metadatos de Storage | 2 buckets y 8 objetos registrados |
| ZIP de Storage | 13 entradas, 8 contenidos únicos y 5 duplicados exactos |

Los hashes y tamaños verificables están en
[`recovery/inventory-2026-07-17.json`](./recovery/inventory-2026-07-17.json).
El inventario excluye valores de filas, nombres de objetos, UUID de usuario,
emails, sesiones y tokens.

## Condición para declarar estable la línea base

- `build`, typecheck y lint terminan sin errores.
- No quedan imports de Ionic.
- CI comprueba navegación esencial, servicios y parsers.
- La base local se reconstruye únicamente desde migraciones y seed.
- Cada tabla pública tiene RLS y tests por rol.
- Los 10 artistas, 8 salas y 8 contenidos únicos se reconcilian; nada sale de
  cuarentena sin propietario, licencia y relación verificadas.

## Infraestructura remota del piloto

| Recurso | Estado al 18 de julio de 2026 |
| --- | --- |
| Supabase | `live-space-pilot`, París, Free, Data API sin exposición automática de tablas |
| Base remota | 6 migraciones aplicadas y registradas; 25/25 tablas públicas con RLS |
| Auth | email/contraseña, confirmación de email, registro activo, anónimo desactivado |
| Edge Functions | firma de subida y webhook desplegados; peticiones no autorizadas rechazadas |
| Cloudinary | entorno `Live Space Pilot` reutilizado por el límite de un entorno del plan Free |
| Presets | `live_space_user_media`, `live_space_professional_media` y `live_space_catalog_media`, todos firmados |
| Webhook | eventos `Upload` hacia `cloudinary-webhook`, firmado con la clave dedicada |

Pendientes humanos: rotar la contraseña de base de datos generada durante el alta,
guardarla en el gestor del propietario, registrar el dominio público cuando exista
y crear la primera cuenta por el flujo normal antes de elevarla a administradora.

La configuración local apunta ya al piloto con una clave publicable. La clave no
se versiona; `.env.example` documenta únicamente las variables requeridas.
