# LIVE SPACE – GLOBAL UX/UI RESET (EJECUTABLE)

Objetivo: pasar de app funcional e impersonal a producto emocional centrado en recuerdos de conciertos.

Principio único: la app no es una herramienta; es un archivo emocional de noches vividas.  
Si una decisión no refuerza esto → no se implementa.

## 0) Reglas no negociables (para TODO PR)

- Fondo base siempre `#0B0B0D` (negro neutro). Nada de gradientes decorativos.
- Texto primario `#FFFFFF`. Texto secundario = `white` con opacidad (no “colores nuevos”).
- Accent único: `#FF6B4A`.
  - Solo para: `Add your moments`, `Follow`, estados activos.
  - Nunca para fondos grandes, hero backgrounds, badges decorativos o “flairs”.
- Prohibido por defecto:
  - `border-*` (bordes visibles)
  - `shadow-*` (sombras)
  - `backdrop-blur*` (glassmorphism)
  - `bg-gradient-*` y gradientes inline no funcionales
- Separación por espacio, no por líneas: si necesitas un separador, primero intenta spacing.

## 1) Design tokens (fuente de verdad)

Fuente de verdad actual:
- `src/index.css` (`--app-*`)
- `src/theme/variables.css` (Ionic `--ion-*`)

Valores obligatorios:
- `--app-bg: #0B0B0D`
- `--app-ink: #FFFFFF`
- `--app-muted: rgba(255,255,255,0.68)` (misma tinta, menor opacidad)
- `--app-accent: #FF6B4A` (único)

Uso en Tailwind:
- Fondo: `bg-app-bg`
- Texto: `text-white` + opacidades (`text-white/70`, `text-white/55`, etc.)
- Accent: `text-app-accent` o `bg-[#ff6b4a]` (solo en los 3 casos permitidos).

## 2) Patrón obligatorio: imagen manda (cards + hero)

Regla absoluta:
- Si hay imagen → edge-to-edge. La imagen ES la card.
- Nunca: marcos, padding “decorativo”, fondos detrás de la imagen.

Overlay mínimo (solo cuando hay texto encima de una imagen):
- Fondo negro con opacidad 60–70% (`bg-black/70`)
- Texto: Artista / Venue / Fecha. Nada más.

Componente de referencia (ya existe):
- `src/components/EventPosterTile.tsx`

## 3) HOME / MAIN (Events) – jerarquía obligatoria

Estados (prioridad estricta):
1) `JUST_ATTENDED` (<72h y sin moments)
2) `UPCOMING` (going)
3) `COLD_START`

JUST_ATTENDED:
- Un solo hero (sin otras secciones visibles)
- Imagen edge-to-edge
- Copy: `Last night at {venue}`
- CTA único y dominante: `Add your moments`
- No desaparece hasta:
  - usuario sube algo, o
  - lo descarta explícitamente

UPCOMING:
- Imagen edge-to-edge
- Copy: `You’re going to`
- CTA secundaria: `View event` (NO accent)

COLD_START:
- Copy permitido: `Discover concerts near you`
- CTAs permitidos: `Explore map`, `Discover` (NO accent)

Implementación actual:
- Hero state: `src/pages/events/hooks/useUserConcertHero.ts`
- UI hero: `src/pages/events/sections/TimelineHeroSection.tsx`
- Pantalla: `src/pages/Events.tsx`

## 4) DISCOVER – menos directorio, más impacto

Estructura fija:
- Search sticky arriba.
- Tabs: `Artists` / `Venues`. Nada más.

Listas:
- Máximo 2 secciones visibles.
- El resto: colapsado (o scroll horizontal si se decide más adelante).

Cards:
- Avatar más grande.
- Contenedor más pequeño.
- `Follow` pequeño y con accent (permitido).
- El nombre manda, no el contenedor.

Implementación actual:
- `src/pages/discover/DiscoverScreen.tsx`
- `src/pages/discover/components/DiscoverSearchBar.tsx`
- `src/pages/discover/components/DiscoverSegmentedControl.tsx`
- `src/pages/discover/components/SuggestedSectionList.tsx`
- `src/pages/discover/components/ArtistRow.tsx`
- `src/pages/discover/components/VenueRow.tsx`

## 5) PROFILE (User) – de panel a memoria viva

Header:
- Avatar, username, ciudad.
- Copy: `Your concert memories live here.`
- CTA: `Discover concerts` (NO accent)

Tabs (orden fijo):
1) `Moments`
2) `Attended`
3) `Liked`

Estados vacíos:
- Copy humano.
- CTA contextual.
- Nunca mostrar “0” como protagonista.

Implementación actual:
- `src/pages/Profile.tsx`

## 6) ARTIST PROFILE – ajustes finales

Header:
- Sin fondos verdes/gradientes.
- Imagen del artista o negro puro.

Orden tabs (fijo):
1) Shows
2) Moments
3) Media
4) About

Implementación actual:
- `src/pages/ArtistProfile.tsx`
- `src/components/artist/ArtistHero.tsx`
- `src/components/artist/ArtistTabs.tsx`

## 7) Copy: tono humano

Evitar:
- copy genérico tipo SaaS, “directorio”, “features”

Usar:
- tiempo pasado, emoción, memoria
- ejemplos: `Last night at…`, `You were there`, `Relive the moment`, `Your memories`

## 8) Tipografía (sin cambiar fuente)

- Labels: uppercase + tracking amplio + opacidad baja.
- Títulos: bold + alto contraste.

## 9) Checklist de PR (merge gate)

- ¿Hay una imagen? → la UI desaparece (edge-to-edge + overlay mínimo).
- ¿Se usó `#FF6B4A` fuera de `Add your moments` / `Follow` / activo? → NO merge.
- ¿Hay `border-*` o `shadow-*` en UI principal? → NO merge.
- ¿Hay `backdrop-blur*`? → NO merge.
- ¿Hay gradientes decorativos? → NO merge.
- ¿La pantalla invita a recordar algo (pasado, emoción) en copy/jerarquía? → si no, rehacer.

