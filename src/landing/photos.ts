// Landing photos live in public/landing/. All are CC0 (Unsplash uploads
// mirrored on Wikimedia Commons): free for commercial use without credit.
// `source` keeps the provenance docs/media.md asks for.

export type LandingPhoto = { src: string; alt: string; source: string };

const commons = (file: string) => `https://commons.wikimedia.org/wiki/File:${file}`;

export const PHOTOS = {
  heroRecording: {
    src: '/landing/hero-movil-grabando.jpg',
    alt: 'Dos manos sostienen un móvil que graba el escenario',
    source: commons('Recording_a_concert_(Unsplash).jpg'),
  },
  redBand: {
    src: '/landing/franja-luz-roja.jpg',
    alt: 'Una persona graba con el móvil a un guitarrista bajo luz roja',
    source: commons('Guitarist_bathed_in_red_light_(Unsplash).jpg'),
  },
  festivalCrowd: {
    src: '/landing/festival-multitud.jpg',
    alt: 'Público de festival frente a un escenario iluminado',
    source: commons('Audience_enjoying_a_concert_(Unsplash).jpg'),
  },
  screenRed: {
    src: '/landing/pantalla-luz-roja.jpg',
    alt: 'Móvil grabando a un guitarrista bajo luz roja',
    source: commons('Guitarist_bathed_in_red_light_(Unsplash).jpg'),
  },
  screenFrontRow: {
    src: '/landing/pantalla-primera-fila.jpg',
    alt: 'Cantante entre el público que graba con móviles',
    source: commons('Concert_photos_(Unsplash).jpg'),
  },
  screenDrums: {
    src: '/landing/pantalla-bateria.jpg',
    alt: 'Batería tocando bajo luces moradas',
    source: commons('Rock_concert_in_intense_light_(Unsplash).jpg'),
  },
  screenPhoneUp: {
    src: '/landing/pantalla-movil-en-alto.jpg',
    alt: 'Un móvil en alto en una sala a oscuras',
    source: commons('Monterrey_concert_silhouette_(Unsplash).jpg'),
  },
  crowdStage: {
    src: '/landing/multitud-escenario.jpg',
    alt: 'Multitud frente a un escenario con focos',
    source: commons('Audience_enjoying_a_concert_(Unsplash).jpg'),
  },
  beardGuitar: {
    src: '/landing/guitarrista-barba.jpg',
    alt: 'Guitarrista con barba entre humo amarillo',
    source: commons('Bearded_guitar_concert_(Unsplash).jpg'),
  },
  sax: {
    src: '/landing/saxo-jazz.jpg',
    alt: 'Saxofones de una banda de jazz bajo luces de colores',
    source: commons('Colorful_jazz_concert_(Unsplash).jpg'),
  },
  smoke: {
    src: '/landing/humo-manos.jpg',
    alt: 'Manos en alto entre humo azul',
    source: commons('Concert-Smoke_(Unsplash).jpg'),
  },
  crowdBack: {
    src: '/landing/publico-escenario.jpg',
    alt: 'Público de espaldas mirando al escenario',
    source: commons('Concert_TUYA_(Unsplash).jpg'),
  },
  frontRow: {
    src: '/landing/primera-fila-bn.jpg',
    alt: 'Público grabando al cantante desde primera fila',
    source: commons('Concert_photos_(Unsplash).jpg'),
  },
  blueHands: {
    src: '/landing/manos-luz-azul.jpg',
    alt: 'Manos levantadas bajo luz azul',
    source: commons('Enjoying_the_concert_(Unsplash).jpg'),
  },
  phoneUp: {
    src: '/landing/movil-en-alto.jpg',
    alt: 'Un móvil en alto en la oscuridad de la sala',
    source: commons('Monterrey_concert_silhouette_(Unsplash).jpg'),
  },
  pedals: {
    src: '/landing/pedales.jpg',
    alt: 'Pies de un guitarrista junto a los pedales',
    source: commons('Rock_concert_(Unsplash).jpg'),
  },
  houseShow: {
    src: '/landing/concierto-en-casa.jpg',
    alt: 'Concierto de punk en una casa, con el público pegado a la banda',
    source: commons('Rock_concert_in_an_apartment_(Unsplash).jpg'),
  },
  drums: {
    src: '/landing/bateria-luces.jpg',
    alt: 'Guitarrista y batería bajo luces moradas',
    source: commons('Rock_concert_in_intense_light_(Unsplash).jpg'),
  },
  singer: {
    src: '/landing/cantante.jpg',
    alt: 'Cantante con gafas de sol frente al micro',
    source: commons('Singer_In_Concert_(Unsplash).jpg'),
  },
  festivalDay: {
    src: '/landing/festival-de-dia.jpg',
    alt: 'Público de festival a pleno día',
    source: commons('Looking_into_festival_crowd_(Unsplash).jpg'),
  },
  guitarBlueRed: {
    src: '/landing/guitarrista-rojo-azul.jpg',
    alt: 'Guitarrista bajo luces rojas y azules',
    source: commons('Guitarist_on_stage_with_blue_and_red_lights_(Unsplash).jpg'),
  },
  youngBand: {
    src: '/landing/banda-joven.jpg',
    alt: 'Banda joven tocando en un escenario pequeño',
    source: commons('Young_band_performing_(Unsplash).jpg'),
  },
  blueSpots: {
    src: '/landing/banda-focos-azules.jpg',
    alt: 'Banda bajo focos azules',
    source: commons('Rock_concert_in_Markham_Civic_Centre_(Unsplash).jpg'),
  },
} satisfies Record<string, LandingPhoto>;

// Frames shown inside the phone mockup, with the upload toast for each.
export const PHONE_SHOTS = [
  { photo: PHOTOS.screenRed, time: '22:41', song: 'Canción 7' },
  { photo: PHOTOS.screenFrontRow, time: '22:58', song: 'Canción 9' },
  { photo: PHOTOS.screenDrums, time: '23:10', song: 'El bis' },
  { photo: PHOTOS.screenPhoneUp, time: '21:32', song: 'Canción 1' },
];

export const MARQUEE_A: LandingPhoto[] = [
  PHOTOS.crowdStage, PHOTOS.houseShow, PHOTOS.sax, PHOTOS.drums,
  PHOTOS.smoke, PHOTOS.singer, PHOTOS.festivalDay, PHOTOS.guitarBlueRed,
];

export const MARQUEE_B: LandingPhoto[] = [
  PHOTOS.frontRow, PHOTOS.pedals, PHOTOS.blueHands, PHOTOS.youngBand,
  PHOTOS.blueSpots, PHOTOS.beardGuitar, PHOTOS.crowdBack, PHOTOS.phoneUp,
];
