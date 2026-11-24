# Gráficos de Google Play

Imágenes de la ficha de Live Space en Play, en [`graficos/`](./graficos/). Todas son PNG sin transparencia. Se generan con plantillas HTML sobre capturas reales de la app (Playwright, 412×860 a 3×), con la paleta y la tipografía de la app (`#0D0E12`, `#FF5B2E`, Space Grotesk).

| Archivo | Tamaño | Para qué |
| --- | --- | --- |
| `feature-1024x500.png` | 1024×500 | Gráfico destacado: logo, «Los conciertos, desde el público» y la Cartelera |
| `01-inicio.png` … `07-sala.png` | 1080×1920 | Capturas de móvil, en este orden: Inicio, canción a canción, subir, mapa, explorar, artista, sala |
| `ls-icon-a.png`, `ls-icon-b.png`, `ls-icon-c.png` | 512×512 | Tres propuestas de icono |
| `hoja-live-space.png` | — | Hoja de revisión con todo junto |

## Icono

El icono actual (anillo con punto) se lee como «grabar» o una app de cámara.

- **A:** el actual, con el anillo más grueso y dentro de la zona segura del icono adaptativo.
- **B (recomendado):** punto con ondas a los lados. Se lee como «en directo» y sigue claro a 48 px.
- **C:** una entrada con el punto. Se entiende, pero hace pensar en una app de venta de entradas, y Live Space no lo es.

Cambiar el icono de la app (`android/app/src/main/res/mipmap-*`) es un paso aparte; estas imágenes no lo tocan.

## Pantallas que faltan

- **Tu entrada** y **Gestión para salas** necesitan sesión iniciada; no hay captura sin datos de una cuenta real.
- La captura de artista enseña la foto de un artista real (Arde Bogotá). Si Play la rechaza por derechos de imagen, se quita y quedan seis.
