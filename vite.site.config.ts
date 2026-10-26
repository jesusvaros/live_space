import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Public website: landing, festival landings and the prerendered static
// pages. The app itself is only shipped inside the Android/iOS builds
// (vite.config.ts -> dist -> Capacitor).
// Dev only: serve site.html for every page navigation, as Cloudflare serves
// the built index.html.
const serveSiteHtml = (): Plugin => ({
  name: 'serve-site-html',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.method === 'GET' && req.headers.accept?.includes('text/html')) req.url = '/site.html'
      next()
    })
  },
})

export default defineConfig({
  plugins: [react(), serveSiteHtml()],
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  publicDir: 'site-public',
  build: {
    outDir: 'dist-site',
    emptyOutDir: true,
    rollupOptions: { input: 'site.html' },
  },
  server: {
    port: 3001,
  },
})
