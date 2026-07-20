# Releases

## Checklist

1. TypeScript, lint, unitarios, E2E, build y wiki verdes.
2. Migraciones aplicadas primero en local y backup restaurable disponible.
3. Matriz RLS, firmas, webhooks, cuotas y moderación verificadas.
4. Android/iOS sincronizados con Capacitor y probados en dispositivos físicos.
5. Changelog, versión, políticas, atribuciones y rollback actualizados.
6. Aprobación humana para migraciones destructivas, secretos, costes y tiendas.

El frontend puede volver al artefacto anterior. PostgreSQL usa migraciones
compensatorias; no se ejecuta rollback ciego. El piloto no se promociona si falta
una restauración probada o queda un crítico de seguridad/moderación.
