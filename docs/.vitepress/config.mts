import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'es-ES',
  title: 'Live Space',
  description: 'Wiki técnica y operativa de Live Space',
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: 'Estado', link: '/estado-actual' },
      { text: 'Arquitectura', link: '/arquitectura' },
      { text: 'Operación', link: '/runbooks' },
      { text: 'Roadmap', link: '/roadmap' },
    ],
    sidebar: [
      {
        text: 'Producto y sistema',
        items: [
          { text: 'Inicio', link: '/' },
          { text: 'Estado actual', link: '/estado-actual' },
          { text: 'Producto y pantallas', link: '/producto' },
          { text: 'Diseño y componentes', link: '/diseno' },
          { text: 'Arquitectura', link: '/arquitectura' },
          { text: 'Modelo de datos', link: '/modelo-datos' },
          { text: 'Seguridad y permisos', link: '/seguridad' },
        ],
      },
      {
        text: 'Datos y operación',
        items: [
          { text: 'Recuperación', link: '/recovery/' },
          { text: 'Scraping', link: '/scraping' },
          { text: 'Media y licencias', link: '/media' },
          { text: 'Moderación', link: '/moderacion' },
          { text: 'Runbooks', link: '/runbooks' },
        ],
      },
      {
        text: 'Ejecución',
        items: [
          { text: 'Manual de agentes', link: '/agentes' },
          { text: 'Releases', link: '/releases' },
          { text: 'Roadmap', link: '/roadmap' },
        ],
      },
    ],
    search: { provider: 'local' },
    socialLinks: [],
    footer: {
      message: 'La documentación cambia en el mismo PR que el comportamiento.',
      copyright: 'Live Space',
    },
  },
})
