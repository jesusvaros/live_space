# Manual de agentes

Los agentes ayudan a construir y operar Live Space, pero producción usa workers
deterministas y no depende de APIs de IA de pago.

## Roles

| Rol | Responsabilidad | Puerta de salida |
| --- | --- | --- |
| Arquitectura | contratos, ADR y límites de dominio | decisión documentada y revisable |
| Backend | migraciones, Edge Functions, RLS y tipos | reset y matriz RLS verdes |
| Datos | parsers, normalización, dedupe y fixtures | idempotencia y calidad acordadas |
| Frontend | producto responsive y accesibilidad | pruebas móvil/tablet/escritorio |
| Capacitor | plugins, deep links y dispositivos | smoke tests Android/iOS físicos |
| QA/seguridad | E2E, abuso, permisos y cuotas | cero críticos abiertos |
| Documentación | wiki, ADR y runbooks | docs coinciden con comportamiento |
| Release | versión, changelog y despliegue | checklist y aprobaciones completas |

## Contrato de tarea

Cada tarea declara objetivo, contexto, alcance de archivos, fuera de alcance,
criterios de aceptación, comandos de verificación, riesgos y documentación a
actualizar. Se trabaja en rama/worktree independiente y se entrega un PR pequeño,
sin incluir cambios preexistentes o secretos.

Antes de editar, el agente inspecciona `git status`, instrucciones del repositorio
y fuentes de verdad. Después ejecuta verificaciones proporcionales, revisa el diff
y comunica limitaciones. Nunca inventa una ejecución exitosa ni oculta fallos.

## Acciones que requieren humano

- Migración destructiva, cambio de RLS o elevación de privilegios.
- Crear, rotar o exponer secretos y credenciales de proveedor.
- Activar pago, superar cuota o cambiar retención.
- Fusión irreversible, borrado físico o sanción definitiva.
- Añadir una fuente con condiciones dudosas o usar una imagen sin licencia.
- Despliegue a producción y publicación en tiendas.

## Workers operativos

Ingesta, normalización, deduplicación, enriquecimiento, calidad, moderación,
backup e informes se implementan como jobs idempotentes, acotados y observables.
Cada job tiene timeout, rate limit, reintentos con backoff, lock de concurrencia,
registro de ejecución y modo dry-run. Una tarea secundaria se suspende al 75 % de
la cuota de Actions; subidas se frenan al 80 % de la cuota de media.

## Definición de hecho

- Código, tests, tipos, lint y build en verde.
- No hay secretos, PII en fixtures ni binarios generados en Git.
- Errores, idempotencia, permisos y observabilidad están cubiertos.
- Se actualizan wiki/changelog/ADR según corresponda.
- El PR explica qué cambió, cómo se probó, riesgos y rollback.
