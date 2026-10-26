# Landings

Las landings venden una sola cosa: **subir fotos y vídeos del concierto**. La
agenda y las entradas son secundarias. El diseño de referencia está en el
lienzo «Landing Live Space» (claude.ai, privado del propietario).

## Rutas

| Ruta | Página | Quién la ve |
| --- | --- | --- |
| `/` | `src/pages/Landing.tsx` | Web sin sesión. Con sesión, o en las apps nativas, `/` redirige a la agenda como antes. |
| `/festival/<slug>/` | `src/pages/FestivalLanding.tsx` | Todos. Un slug desconocido redirige a `/`. |

Las dos se cargan en diferido (chunk propio), así que la app no carga su CSS,
sus fuentes ni sus fotos.

## Reglas de contenido

- La landing general es **genérica**: sin nombres de festivales, bandas ni
  salas, y sin cifras de catálogo que caduquen.
- Un festival solo aparece en **su** landing, creada desde la plantilla.
- Poco texto: titular, una frase y el botón. El resto lo cuentan las fotos.
- El botón principal siempre es subir (`/tabs/upload`, que pide sesión si no la
  hay). Nunca «Entradas».
- La línea de tiempo («La noche, canción a canción») y el móvil que sube clips
  son ilustraciones: los nombres «Canción 7» o «El bis» y los recuentos de clips
  son de ejemplo y no salen de la base de datos.

## Estructura

Landing general, de arriba abajo:

1. **Portada**: foto a sangre con zoom lento, «Lo grabaste. Súbelo.» y un móvil
   que flota y pasa cuatro clips (sello REC, barra de subida y aviso «Subido a
   "Canción N"»).
2. **Galería**: dos tiras de fotos que se desplazan en sentidos opuestos; se
   paran al pasar el ratón.
3. **«Tres toques.»**: escanea el QR, sube tu clip, sale en su canción.
4. **«La noche, canción a canción.»**: cabezal recorriendo la noche, clips
   apareciendo por canción y ecualizador.
5. **«¿Te perdiste el bis? Alguien lo grabó.»**: franja de foto con botón.
6. **Salas y festivales**: «Pon un QR. El público hace el resto.» y botón
   «Pide tu QR».

Landing de festival: portada «¿Estuviste en [festival]?» con lugar y fechas,
galería, cartel (solo si hay `lineup`), franja «Busca el QR en el recinto» con
la dirección de la página y botón de contacto para organizadores.

Piezas compartidas en `src/landing/parts.tsx`: cabecera (con co-marca para
festivales), botón principal, galería, móvil animado, QR decorativo, botón de
contacto y pie.

## Añadir un festival

1. Añade una entrada a `FESTIVALS` en `src/landing/festivals.ts`:

   ```ts
   {
     slug: 'mi-festival',
     name: 'Mi Festival',
     place: 'Ciudad (Provincia)',
     dates: '3–5 de julio de 2027',        // opcional
     hero: '/landing/festivales/mi-festival.jpg',
     heroAlt: 'Descripción de la foto',
     lineup: ['Banda 1', 'Banda 2'],        // opcional; sin él no hay cartel
   }
   ```

2. La foto de portada va en `public/landing/` con licencia comprobada (ver
   abajo). Mientras no haya una del festival, usa `/landing/festival-multitud.jpg`.
3. PR. Al publicar, el prerender crea `/festival/<slug>/` con title,
   description y entrada en `sitemap.xml`.

El QR físico del recinto debe apuntar a `https://<dominio>/festival/<slug>/`.

## Animación y accesibilidad

Las animaciones están en `src/landing/landing.css` (clases `ls-*`) y usan solo
`transform` y `opacity`. Con `prefers-reduced-motion: reduce` todas se paran y
el móvil deja de cambiar de clip. Las fotos decorativas llevan `alt=""`; las que
cuentan algo llevan texto alternativo. Los botones miden al menos 44 px.

Tipografías solo de landing: Archivo (titulares estrechos) e IBM Plex Mono
(sellos y horas), importadas desde Google Fonts en `landing.css`.

## Fotos y licencias

Todas las fotos de `public/landing/` son **CC0** (subidas a Unsplash y copiadas
en Wikimedia Commons): uso comercial sin permiso ni atribución. La URL de origen
de cada una está en `src/landing/photos.ts` (campo `source`). No son fotos de
festivales concretos.

No se usan capturas de vídeos de YouTube o TikTok de terceros sin permiso
escrito del autor. Una foto nueva entra con su URL de origen y su licencia en
`photos.ts`, como pide [Media y licencias](./media.md).

## Configuración

| Variable | Uso |
| --- | --- |
| `VITE_CONTACT_EMAIL` | Dirección del botón «Pide tu QR» / «¿Organizas…?». Si está vacía, el botón no aparece. En el despliegue es una variable del repo (`vars.VITE_CONTACT_EMAIL`). |
| `PUBLIC_SITE_URL` | Dominio para canonical y sitemap del prerender. |

## SEO

`index.html` lleva el título y la descripción de la landing, que sirve `/`. No
se prerenderiza `/`, porque `dist/index.html` es también el fallback de la SPA
para cualquier ruta; sí aparece en `sitemap.xml`. Las páginas de festival se
prerenderizan en `buildPublicSite.ts`.

## Pendiente

- Dominio definitivo y `VITE_CONTACT_EMAIL`.
- Fotos propias de cada festival para su portada.
- QR real (escaneable) en la franja de festival; ahora es un icono.
