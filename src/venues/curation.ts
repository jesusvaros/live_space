// Hand-verified venue facts. Discovery and scrapers only fill empty fields, so
// these values are not overwritten once applied with `npm run venues:curate`.

// Former official domains now redirecting to casino spam or unrelated blogs
// (checked 26-Oct-2026). Never store or probe them as a venue website.
export const HIJACKED_WEBSITE_HOSTS: Record<string, string> = {
  'barcobar.com': 'BarCo: redirige a spam de tragaperras',
  'salalemon.com': 'Sala Lemon: redirige a spam de tragaperras',
  'eljunco.com': 'El Junco: afiliado de casinos',
  'taboo-madrid.com': 'Taboó: blog ajeno',
  'populart.es': 'Café Populart: blog ajeno',
  'wahwahclub.es': 'Wah Wah Club: blog de clubes ajeno',
};

export const websiteHost = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
};

export const isHijackedWebsite = (url: string | null | undefined): boolean => {
  const host = websiteHost(url);
  return host !== null && host in HIJACKED_WEBSITE_HOSTS;
};

export type VenueAddress = {
  venueId: string;
  name: string;
  address: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
  source: string;
};

// Addresses from each venue's official site (Independance Club from OSM: its
// site was unreachable); coordinates from the venue's own OpenStreetMap object.
export const VENUE_ADDRESSES: VenueAddress[] = [
  {
    venueId: 'ad57e349-d3d4-4884-80c4-9957722b30f0',
    name: 'Jamboree',
    address: 'Plaça Reial 17',
    postalCode: '08002',
    latitude: 41.3797128,
    longitude: 2.1751933,
    source: 'https://jamboreejazz.com/',
  },
  {
    venueId: 'c28bfeb9-fcde-44d4-b330-aeb4a1026b77',
    name: 'Luz de Gas',
    address: 'Carrer de Muntaner 246',
    postalCode: '08021',
    latitude: 41.3945996,
    longitude: 2.1490385,
    source: 'https://luzdegas.com/es/contacto/',
  },
  {
    venueId: '4f679e6d-8d22-4db0-b662-06d990ccd26c',
    name: 'Razzmatazz',
    address: 'Carrer dels Almogàvers 122',
    postalCode: '08018',
    latitude: 41.3975863,
    longitude: 2.1912493,
    source: 'https://www.salarazzmatazz.com/info/',
  },
  {
    venueId: 'd273de87-b4cf-484a-908c-4aef7a36e821',
    name: 'Sala Apolo',
    address: 'Carrer Nou de la Rambla 107',
    postalCode: '08004',
    latitude: 41.3743908,
    longitude: 2.1695606,
    source: 'https://www.sala-apolo.com/es/contacto',
  },
  {
    venueId: 'd4cafb5f-de68-4958-a253-7c7999809fb9',
    name: 'Independance Club',
    address: 'Calle de Atocha 125',
    postalCode: '28012',
    latitude: 40.409692,
    longitude: -3.6930041,
    source: 'https://www.openstreetmap.org (web oficial no accesible el 26-oct)',
  },
  {
    venueId: '66242507-0439-4b3b-9e72-550d324a1571',
    name: 'La Riviera',
    address: 'Paseo Bajo de la Virgen del Puerto s/n',
    postalCode: '28005',
    latitude: 40.4129548,
    longitude: -3.7221336,
    source: 'https://salariviera.com/contacto-2/',
  },
  {
    venueId: '825c2290-1f9a-45e4-ae45-d0cdc9f57808',
    name: 'Movistar Arena',
    address: 'Avenida de Felipe II s/n',
    postalCode: '28009',
    latitude: 40.4238624,
    longitude: -3.6717885,
    source: 'https://www.movistararena.es/',
  },
  {
    venueId: 'e5fef011-e598-411b-84b0-f153ec2842b0',
    name: 'Sala But',
    address: 'Calle de Barceló 11',
    postalCode: '28004',
    latitude: 40.4269857,
    longitude: -3.6995918,
    source: 'https://www.salabut.es/',
  },
  {
    venueId: '82edced1-f7ba-42b9-b5a0-213e6ede829e',
    name: 'Sala But',
    address: 'Calle de Barceló 11',
    postalCode: '28004',
    latitude: 40.4269857,
    longitude: -3.6995918,
    source: 'https://www.salabut.es/',
  },
  {
    venueId: '5b6e0dc9-32aa-41cc-8288-11977592ddd1',
    name: 'Siroco',
    address: 'Calle de San Dimas 3',
    postalCode: '28015',
    latitude: 40.4269196,
    longitude: -3.7077365,
    source: 'https://siroco.es/contacto/',
  },
  {
    venueId: '0a2dec47-7931-4192-ae44-8de2f28731da',
    name: 'Sala Wagon',
    address: 'Estación de Chamartín, planta ático',
    postalCode: '28036',
    latitude: 40.4712686,
    longitude: -3.6824281,
    source: 'https://www.wagon.live/',
  },
  {
    venueId: '50724f17-d7a9-4a06-9b6b-dc376f1d2176',
    name: 'Sala Clamores',
    address: 'Calle de Alburquerque 14',
    postalCode: '28010',
    latitude: 40.4311104,
    longitude: -3.7009938,
    source: 'https://www.salaclamores.com/contacto',
  },
  {
    venueId: 'f82816b2-e27e-4f68-95cb-07f20693766d',
    name: 'Fun House',
    address: 'Calle de Palafox 8',
    postalCode: '28010',
    latitude: 40.4315015,
    longitude: -3.7012174,
    source: 'https://www.funhousemusicbar.com/contacto/',
  },
];
