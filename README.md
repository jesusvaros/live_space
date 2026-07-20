# Live Space

Live Space es una plataforma audiovisual para descubrir conciertos y revivirlos
con fotografías y vídeos de fans. Web, Android e iOS comparten la aplicación
React; Capacitor aporta únicamente las capacidades nativas.

## Stack

- React 19, Vite, React Router 7, Tailwind, Radix y componentes propios.
- Capacitor 8 para Android/iOS.
- Supabase (PostgreSQL, Auth, RLS y Edge Functions).
- Cloudinary detrás de firmas de corta duración.
- Scraping determinista con revisión humana para Madrid y Barcelona.
- Wiki VitePress en [`docs/`](./docs/).

## Desarrollo

```bash
npm ci
npm run dev
```

La app espera `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en un `.env.local`
ignorado por Git. Las claves privilegiadas no deben usar nunca el prefijo
`VITE_` ni llegar al cliente.

## Puertas de calidad

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
npm run docs:build
```

CI ejecuta las mismas comprobaciones en cada push y pull request. Los smoke tests
E2E cubren Chromium móvil y escritorio.

## Backend local

Con Docker activo:

```bash
npm run db:start
npm run db:reset
npm run db:lint
npm run db:typegen
```

Las migraciones de [`supabase/migrations/`](./supabase/migrations/) son la única
fuente de verdad. Los SQL históricos de la raíz son solo material de recuperación
y no deben aplicarse al proyecto nuevo.

## Recuperación e ingesta

- El inventario seguro de los backups está en
  [`docs/recovery/inventory-2026-07-17.json`](./docs/recovery/inventory-2026-07-17.json).
- La restauración se hace solo en PostgreSQL local aislado siguiendo
  [`tools/recovery/README.md`](./tools/recovery/README.md).
- Los workers de scraping se compilan con `npm run scrape:build`; por defecto se
  limitan a Madrid y Barcelona y no usan una API de IA de pago.

Consulta la [wiki](./docs/index.md) para arquitectura, seguridad, scraping,
runbooks, agentes y roadmap.
