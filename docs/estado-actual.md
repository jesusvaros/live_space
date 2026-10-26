# Estado actual

Fecha de la última actualización: **26 de octubre de 2026**.

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
  (`eu-west-3`) sobre el plan Free. Las siete migraciones canónicas aplicadas
  mantienen 30 tablas públicas y RLS en todas ellas.
- La base local cuenta con configuración, siete migraciones canónicas, RLS,
  cuotas de media, modelos de lectura y Edge Functions de firma/webhook. Las
  siete migraciones están aplicadas y registradas en el piloto remoto. Falta ejecutar el reset real porque
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
  deduplicación. Hay 18 fuentes piloto versionadas y 13 operativas:
  Independance Club, Jamboree, La Riviera, Movistar Arena, Siroco, Sala Apolo,
  Sala But, Sala El Sol, Luz de Gas, Razzmatazz, Fun House, Sala Clamores y Sala
  Wagon. La base remota conserva 292 conciertos publicados, 133 futuros, 276
  artistas publicados y 34 salas publicadas. La captura real del 26 de octubre
  leyó 493 entradas de las 13 fuentes sin errores y dejó todos sus watchers en
  estado saludable. Movistar Arena aportó 71 conciertos y el parser excluyó los
  partidos de baloncesto que su filtro oficial mezcla en el HTML.
- El descubridor de salas y el watcher de cambios están desplegados en base de
  datos. La primera pasada nacional procesó 54/54 ciudades, produjo 86 candidatos,
  confirmó 25 salas con evidencia `amenity=music_venue` y elevó el catálogo a 34
  salas publicadas. Diecinueve webs oficiales nuevas están en la cola inactiva de
  implementación de parser. La ejecución repetida de Madrid produjo cero altas.
  El descubrimiento nacional se divide ahora en cinco shards para evitar el
  timeout de GitHub Actions. El sondeo de webs se ejecuta después en un job
  separado, y un fallo individual no invalida los resultados de las demás
  fuentes. El mantenimiento diario cierra ejecuciones abandonadas y resuelve
  alertas de eventos pasados o indeterminados que llevan 30 días sin reaparecer;
  no borra eventos ni observaciones. En la ejecución de recuperación resolvió
  444 alertas históricas y cerró tres runs atascados.
- El auto-sondeo de las 19 webs descubiertas clasificó tres fuentes reproducibles,
  15 que requieren parser específico y una no compatible. Las tres reproducibles
  ya están activas. Su primera captura añadió 51 candidatos a staging: 50 esperan
  revisión de artista/título y uno se rechazó. El alta queda auditada mediante el
  comando `scrape:approve-probed`; el sondeo semanal nunca activa una fuente que
  no haya sido revisada.

## Deuda heredada

- Conviven SQL históricos incompatibles; no deben ejecutarse en bloque sobre el
  proyecto nuevo.
- Los backups incluyen datos de Auth que no se restaurarán: cuentas, sesiones,
  tokens y contraseñas quedan expresamente fuera de la migración.
- TypeScript, lint, las pruebas unitarias, 8 smoke tests E2E responsive, build de
  aplicación y build de documentación pasan y están conectados a CI. Aún faltan
  la matriz de tests RLS, fixtures por fuente y pruebas completas de subida.
- El audit de producción está limpio. VitePress 1.6.4 arrastra tres avisos solo de
  desarrollo sin actualización estable disponible; la wiki no debe exponerse
  mediante su servidor de desarrollo en una red no confiable.
- El catálogo inicial es muy pequeño y no contiene vídeos registrados en la tabla
  pública heredada, aunque el archivo de Storage sí conserva media en cuarentena.

## Auditoría funcional en navegador — 26 de octubre de 2026

La aplicación se recorrió con el backend remoto real, primero en viewport móvil y
después en escritorio. El catálogo anónimo carga y permite navegar por artistas,
salas y conciertos, pero el producto todavía no está listo para una beta pública.

| Área | Resultado observado | Prioridad |
| --- | --- | --- |
| Inicio | Carga artistas y salas con conciertos; la cabecera reserva demasiado espacio vacío cuando no hay imagen | Media |
| Explorar | Artistas y salas aparecen, pero casi todos carecen de fotografía y algunos nombres de artista contienen el título de gira o del evento | Alta |
| Sala | Un error de RLS al contar seguidores hacía que una sala existente apareciera como inexistente. Corregido para que agenda, social y momentos fallen de forma independiente | Crítica, corregida |
| Agenda de sala | Se mostraba también todo el histórico en una lista muy larga. Ahora la ficha solicita solo conciertos desde el inicio del día actual | Alta, corregida |
| Evento | La ficha abre y enlaza artista/sala, pero la ausencia de carteles deja una cabecera casi vacía | Alta |
| Mapa | Corregido el 26 de octubre tras probarlo en el emulador Android: el mapa vectorial no cargaba (MapLibre 6 no encontraba su worker en el build) y caía a teselas OSM; arrancaba en Sevilla y guardaba esa vista para siempre; nunca pedía la ubicación y Android no declaraba el permiso. Ahora parte de Madrid o de la ubicación del usuario y la vista ya no es controlada por React, que era el origen del bucle de render. Falta una pestaña propia en la barra inferior | Alta, corregida en parte |
| Momentos | No hay media publicada; la pantalla queda vacía sin explicación ni llamada a crear el primer momento | Alta |
| Crear y Perfil | Redirigen correctamente a acceso para anónimos; el recorrido autenticado, firma Cloudinary, confirmación de webhook y gestión profesional aún debe probarse con una cuenta de ensayo | Crítica antes de beta |
| Escritorio | El layout es esencialmente la versión móvil estirada y conserva la navegación inferior; falta la barra lateral/cabecera y una densidad de contenido propia de escritorio | Alta |
| Marca e idioma | Conviven `SpacioMusical`, `Live Space`, español e inglés en la misma experiencia. El acceso ya está rediseñado en español con la marca Live Space (26 de octubre); el resto de pantallas sigue igual | Media |

Orden recomendado: reparar el bucle del mapa, crear cuenta de ensayo y verificar
los recorridos autenticados, completar carteles/fotos con licencia, corregir la
resolución de artistas, diseñar el shell de escritorio y añadir estados vacíos.

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

| Recurso | Estado al 26 de octubre de 2026 |
| --- | --- |
| Supabase | `live-space-pilot`, París, Free, Data API sin exposición automática de tablas |
| Base remota | 7 migraciones aplicadas y registradas; 30/30 tablas públicas con RLS |
| Auth | email/contraseña, confirmación de email, registro activo, anónimo desactivado |
| Edge Functions | firma de subida y webhook desplegados; peticiones no autorizadas rechazadas |
| Cloudinary | entorno `Live Space Pilot` reutilizado por el límite de un entorno del plan Free |
| Presets | `live_space_user_media`, `live_space_professional_media` y `live_space_catalog_media`, todos firmados |
| Webhook | eventos `Upload` hacia `cloudinary-webhook`, firmado con la clave dedicada |
| Vercel | Live Space no registra despliegues en Vercel; la cuota compartida llena procede de otros proyectos del equipo |

Pendientes humanos: rotar la contraseña de base de datos generada durante el alta,
guardarla en el gestor del propietario, registrar el dominio público cuando exista
y crear la primera cuenta por el flujo normal antes de elevarla a administradora.

La configuración local apunta ya al piloto con una clave publicable. La clave no
se versiona; `.env.example` documenta únicamente las variables requeridas.
