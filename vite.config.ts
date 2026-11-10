import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  // Ajustes → Acerca de on the web build; the native apps show their own version.
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    port: 3000,
  },
})
