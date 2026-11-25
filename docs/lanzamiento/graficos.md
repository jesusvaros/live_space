# Gráficos de Google Play

Imágenes de la ficha de Live Space en Play, en la carpeta `docs/lanzamiento/graficos/`. Todas son PNG sin transparencia. Se generan con plantillas HTML sobre capturas reales de la app (Playwright, 412×860 a 3×), con la paleta y la tipografía de la app (`#0D0E12`, `#FF5B2E`, Space Grotesk).

| Archivo | Tamaño | Para qué |
| --- | --- | --- |
| `feature-1024x500.png` | 1024×500 | Gráfico destacado: logo, «Los conciertos, desde el público» y la Cartelera |
| `01-inicio.png` … `07-sala.png` | 1080×1920 | Capturas de móvil, en este orden: Inicio, canción a canción, subir, mapa, explorar, artista, sala |
| `icono-512.png` | 512×512 | Icono de la ficha de Play |
| `icono.svg` | — | Fuente del icono |
| `hoja-live-space.png` | — | Hoja de revisión con todo junto |

## Icono

«Mano arriba»: un brazo levantado sujetando el móvil con la pantalla naranja, la postura de cualquiera grabando en un concierto. Colores planos (`#0D0E12`, `#F3EDE4`, `#FF5B2E`) y el borde un poco a mano, sin textura.

Se descartaron el anillo con punto (se leía como una app de cámara) y otras ideas: un foco en forma de L, público, escenario, pulsera de festival y setlist.

El mismo dibujo está en la app:

- **Android:** `android/app/src/main/res/mipmap-*`. El icono adaptativo usa el fondo `#0D0E12` y el dibujo al 72 %, para que el móvil quede dentro de la zona visible.
- **iOS:** `AppIcon-512@2x.png`.
- **Fuentes de Capacitor:** `assets/icon-*.png`.

## Pantallas que faltan

- **Tu entrada** y **Gestión para salas** necesitan sesión iniciada; no hay captura sin datos de una cuenta real.
- La captura de artista enseña la foto de un artista real (Arde Bogotá). Si Play la rechaza por derechos de imagen, se quita y quedan seis.
