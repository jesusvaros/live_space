# Roadmap

Las duraciones son orientativas; las puertas de salida deciden el avance.

## Progreso a 18 de julio de 2026

- Recuperación e inventario: completados sin extraer datos sensibles.
- CI, typecheck, lint, tests, app y wiki: verdes.
- Retirada de Ionic en código y dependencias: completada; quedan pruebas en
  dispositivos físicos antes de cerrar formalmente la fase.
- Supabase y Cloudinary remotos: creados y configurados; migraciones, RLS, presets,
  secretos, Edge Functions y webhook están desplegados. Siguen pendientes el reset
  local con Docker y ampliar los tests RLS autenticados por rol.
- Contrato de frontend: Auth, catálogo, eventos, mapa, gestión profesional y
  setlists migrados; carteles y momentos usan firma Cloudinary y confirmación del
  webhook. Feed, Perfil, Upload y Admin ya usan los modelos canónicos compartidos.
- Navegación anónima: agenda, Explorar, Mapa y Momentos verificados en navegador;
  Crear y Perfil permanecen protegidos. Se corrigió un bucle de render del estado
  inicial y los seis recorridos E2E pasan en móvil y escritorio.
- Scraping: piloto limitado a Madrid/Barcelona y sin IA de pago; siete fuentes
  oficiales se ejecutan diariamente en GitHub Actions. La primera ejecución manual
  desde `main` terminó sin errores y confirmó la idempotencia del pipeline.

## Fase 0 — Recuperación y línea base

- Preservar cambios heredados e inventariar ambos backups.
- Restaurar solo en local, crear snapshot selectivo y reconciliar cuarentena.
- Conseguir build, typecheck, lint y CI reproducibles.
- Publicar esta wiki y reglas de trabajo.

**Salida:** hashes/conteos explicados, cero secretos, herramientas verdes y estado
heredado preservado.

## Fase 1 — Retirada de Ionic

- Router declarativo, `AppShell`, navegación responsive y deep links.
- Sustituir páginas, contenidos, tabs, modales, sheets, toast y loaders.
- Retirar dependencias/CSS Ionic y validar scroll/atrás/estado.

**Salida:** cero imports Ionic y recorridos esenciales verdes en web, Android e iOS.

## Fase 2 — Backend y media

- Crear Supabase/Cloudinary del piloto bajo cuentas del propietario.
- Consolidar migraciones, RLS, tipos, Edge Functions y `MediaProvider`.
- Importar catálogo revisado; media única permanece en cuarentena hasta aprobación.
- Implementar backup cifrado y restauración probada.

**Salida:** reset desde cero, matriz RLS verde, subida firmada segura y reconciliación
completa.

## Fase 3 — Ingesta Madrid/Barcelona

- Catalogar y revisar las 18 fuentes.
- Parser y fixture real por fuente; staging, procedencia, confianza y dedupe.
- Enriquecer con MusicBrainz/Commons respetando límites y licencias.
- Operar 14 días en staging.

**Salida:** éxito y precisión `>=95 %`, duplicados `<2 %` y alertas en menos de 24 h.

## Fase 4 — Producto audiovisual compartido

- Inicio, explorar/lista/mapa, crear, momentos y perfil.
- Eventos, artistas, salas, setlists, social y subida reanudable.
- Gestión profesional y administración disponibles en web y apps.
- Rendimiento, accesibilidad y errores de red.

**Salida:** E2E responsive y recorridos completos en dispositivos físicos.

## Fase 5 — Moderación y beta

- Términos, reportes, bloqueo, ocultación, revisión, apelación y auditoría.
- Cuotas, telemetría, QR, notificaciones, permisos y recuperación de errores.
- Beta cerrada y corrección de críticos.

**Salida:** cero fallos críticos, operación de moderación real y requisitos de
tiendas cubiertos.

## Expansión

1. Sevilla y Valencia.
2. Bilbao y Málaga.
3. Zaragoza, Granada y Murcia.
4. Resto de España según demanda, fuentes y capacidad operativa.

Una ciudad no se activa por calendario: debe cumplir los mismos umbrales del
piloto. Al 70 % de cualquier cuota se revisa capacidad; al 80 % se limita la
operación antes de generar cargos.

## Registro de deuda

La deuda se etiqueta por seguridad, datos, producto, plataforma u operación. Cada
entrada incluye impacto, evidencia y condición de resolución. Seguridad/RLS,
pérdida de datos, licencias y moderación bloquean release; mejoras estéticas no.
