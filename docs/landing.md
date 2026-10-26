# Web pública y landings

No hay versión web de la app: la app solo existe en Android e iOS. La web
pública existe para una cosa, **que la gente instale la app**, y vende subir
fotos y vídeos del concierto. El diseño de referencia está en el lienzo
«Landing Live Space» (claude.ai, privado del propietario).

## Dos builds separados

| Build | Comando | Salida | Contenido |
| --- | --- | --- | --- |
| App | `npm run build` | `dist/` | La app completa; la empaqueta Capacitor. No incluye la landing. |
| Web pública | `npm run web:prerender` | `dist-site/` | Landing, landings de festival y fichas estáticas. No incluye la app. |

`npm run site:dev` sirve la web en `http://localhost:3001` y `npm run dev` la app
en el 3000. La web tiene su propia entrada (`site.html` → `src/landing/main.tsx`,
configuración `vite.site.config.ts`) y sus imágenes en `site-public/`.

## Rutas de la web

| Ruta | Qué es |
| --- | --- |
| `/` | Landing (`src/landing/pages/Landing.tsx`). |
| `/festival/<slug>/` | Landing de festival (`src/landing/pages/FestivalLanding.tsx`), prerenderizada. |
| `/concierto/…`, `/sala/…`, `/artista/…`, `/{madrid,barcelona}/conciertos/…` | Fichas en HTML estático, sin JavaScript, con foto, datos, JSON-LD y el bloque «¿Vas a ir? Grábalo y súbelo» con el botón de descarga. Estilos en `site-public/landing/fichas.css`. |
| Rutas antiguas de la app (`/tabs/*`, `/welcome`, `/upload`…) | 302 a `/`. Las URL con UUID de concierto, sala o artista van con 301 a su ficha. |
| Cualquier otra | `404.html`. |

## Descargar la app y lista de espera

Todos los botones llevan a la sección `#descargar`. Mientras la app no esté en
las tiendas, el bloque de descarga es un formulario de **lista de espera**: guarda
el email en `public.waitlist_signups` con la página de origen (`landing-hero`,
`landing-descargar`, `festival:<slug>`). La tabla solo admite inserciones
anónimas; nadie la puede leer salvo `service_role`. Un email repetido cuenta como
apuntado.

Cuando haya enlaces de tienda, se definen `VITE_ANDROID_URL` y `VITE_IOS_URL` y
el formulario se sustituye por los botones de Google Play y App Store.

## Reglas de contenido

- La landing general es **genérica**: sin nombres de festivales, bandas ni
  salas, y sin cifras de catálogo que caduquen.
- Un festival solo aparece en **su** landing, creada desde la plantilla.
- Poco texto: titular, una frase y el botón. El resto lo cuentan las fotos.
- El botón principal siempre es descargar la app (o apuntarse a la lista de
  espera). Nunca «Entradas»; en las fichas, el enlace oficial del concierto es
  texto secundario («Más información y entradas»).
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
7. **«Llévatelo en el bolsillo.»** (`#descargar`): lista de espera o botones de
   tienda.

Landing de festival: portada «¿Estuviste en [festival]?» con lugar y fechas,
galería, cartel (solo si hay `lineup`) y bloque «Descárgate la app y súbelo»
con lista de espera, la dirección de la página para el QR del recinto y botón de
contacto para organizadores.

Piezas compartidas en `src/landing/parts.tsx`: cabecera (con co-marca para
festivales), botón de descarga, bloque de descarga/lista de espera
(`DownloadCta`, con `src/landing/waitlist.ts`), galería, móvil animado, QR
decorativo, botón de contacto y pie.

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

2. La foto de portada va en `site-public/landing/` con licencia comprobada (ver
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

Todas las fotos de `site-public/landing/` son **CC0** (subidas a Unsplash y copiadas
en Wikimedia Commons): uso comercial sin permiso ni atribución. La URL de origen
de cada una está en `src/landing/photos.ts` (campo `source`). No son fotos de
festivales concretos.

No se usan capturas de vídeos de YouTube o TikTok de terceros sin permiso
escrito del autor. Una foto nueva entra con su URL de origen y su licencia en
`photos.ts`, como pide [Media y licencias](./media.md).

## Configuración

| Variable | Uso |
| --- | --- |
| `VITE_CONTACT_EMAIL` | Dirección del botón «Pide tu QR» / «¿Organizas…?». Si está vacía, el botón no aparece. |
| `VITE_ANDROID_URL`, `VITE_IOS_URL` | Enlaces de Google Play y App Store. Con alguno definido, la lista de espera se sustituye por los botones de tienda. |

En el despliegue son variables del repo (`vars.*`) que lee `publish-web.yml`.
| `PUBLIC_SITE_URL` | Dominio para canonical y sitemap del prerender. |

## SEO

`site.html` lleva el título y la descripción de la landing, que sirve `/` y no
se prerenderiza; sí aparece en `sitemap.xml`. Las fichas y las páginas de
festival se generan en `buildPublicSite.ts` con canonical, Open Graph y JSON-LD.
`robots.txt` lo permite todo: en la web ya no hay rutas privadas.

## Pendiente

- Aplicar la migración `20261026000100_waitlist_signups.sql` en Supabase (cambio
  de RLS: lo aprueba una persona). Hasta entonces el formulario responde «No
  hemos podido apuntarte».
- Dominio definitivo, `VITE_CONTACT_EMAIL` y, al publicar, los enlaces de tienda.
- Fotos propias de cada festival para su portada.
- QR real (escaneable) en la franja de festival; ahora es un icono.
