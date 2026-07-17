# Estado actual

Fecha de la auditoría de recuperación: **17 de julio de 2026**.

## Código

- Aplicación React 19 construida con Vite y empaquetada para Android/iOS mediante
  Capacitor 8.
- React Router 7 es el router objetivo compartido; Ionic React se retira por
  completo, manteniendo solo Capacitor para capacidades nativas.
- La migración de router y primitivas está implementada: no quedan imports de
  Ionic y las pantallas pesadas se cargan en chunks separados.
- La interfaz incluye descubrimiento, agenda, mapa, feed, perfiles de artista y
  sala, detalle de evento, subida, QR y pantallas administrativas.
- Supabase es el backend previsto. Las migraciones versionadas deben convertirse
  en la única fuente de verdad antes de desplegar el nuevo proyecto remoto.
- La base local cuenta con configuración, dos migraciones canónicas, RLS, cuotas
  de media y Edge Functions de firma/webhook. Falta ejecutar el reset real porque
  Docker no está disponible en esta máquina durante la revisión.
- El nuevo contrato normaliza autores, membresías y activos respecto al SQL
  heredado. Varias consultas de pantallas todavía usan nombres antiguos; esa capa
  de servicios debe migrarse antes de conectar la app al piloto remoto.
- Hay un prototipo de ingesta con fuentes, ejecuciones, staging, normalización,
  deduplicación y parsers genéricos. Aún requiere fixtures por fuente, control de
  confianza y operación prolongada en staging.

## Deuda heredada

- Conviven SQL históricos incompatibles; no deben ejecutarse en bloque sobre el
  proyecto nuevo.
- Los backups incluyen datos de Auth que no se restaurarán: cuentas, sesiones,
  tokens y contraseñas quedan expresamente fuera de la migración.
- TypeScript, lint, 18 pruebas unitarias, 4 smoke tests E2E responsive, build de
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
